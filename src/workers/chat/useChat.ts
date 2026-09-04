/**
 * useChat — React hook for Leish real-time chat
 *
 * Features:
 * - WebSocket connection management with auto-reconnect
 * - Optimistic UI updates (instant message send)
 * - Message history with infinite scroll
 * - Presence & typing indicators
 * - Read receipts
 * - Connection state tracking
 * - Error handling & retry
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type {
  ChatMessage,
  ChatMessageInput,
  UserPresence,
  ClientToServerMessage,
  ServerToClientMessage,
  TypingUpdate,
} from "./types";

/** An error surfaced by the chat server, carrying its machine-readable code. */
export interface ChatError extends Error {
  code?: string;
}

// ── Configuration ─────────────────────────────────────────────────────────────

interface UseChatOptions {
  bookingId: string;
  token: string;
  wsUrl: string; // e.g., "wss://chat.leish.my/ws/"
  // Callbacks
  onMessage?: (message: ChatMessage) => void;
  onPresenceChange?: (users: UserPresence[]) => void;
  onTyping?: (typing: TypingUpdate) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  // Behavior
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  maxHistoryMessages?: number;
}

interface UseChatReturn {
  // Connection state
  status: "connecting" | "connected" | "disconnected" | "error";
  error: Error | null;
  // Messages
  messages: ChatMessage[];
  hasMoreHistory: boolean;
  isLoadingHistory: boolean;
  // Presence
  users: UserPresence[];
  currentUser: UserPresence | null;
  // Typing
  typingUsers: UserPresence[];
  // Actions
  sendMessage: (body: string) => Promise<ChatMessage | null>;
  sendTyping: (isTyping: boolean) => void;
  markRead: (messageId: string) => void;
  loadMoreHistory: () => Promise<void>;
  reconnect: () => void;
  disconnect: () => void;
}

// ── Helper: Generate temporary ID for optimistic messages ─────────────────────

function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Main Hook ──────────────────────────────────────────────────────────────────

export function useChat(options: UseChatOptions): UseChatReturn {
  const {
    bookingId,
    token,
    wsUrl,
    onMessage,
    onPresenceChange,
    onTyping,
    onError,
    onConnect,
    onDisconnect,
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000,
    maxHistoryMessages = 100,
  } = options;

  // ── State ───────────────────────────────────────────────────────────────────

  const [status, setStatus] = useState<UseChatReturn["status"]>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [currentUser, setCurrentUser] = useState<UserPresence | null>(null);
  const [typingUsers, setTypingUsers] = useState<UserPresence[]>([]);

  // ── Refs ────────────────────────────────────────────────────────────────────

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<
    Array<{
      msg: ClientToServerMessage;
      resolve: (v: ChatMessage) => void;
      reject: (e: Error) => void;
    }>
  >([]);
  const pendingMessagesRef = useRef<Map<string, ChatMessage>>(new Map()); // tempId -> optimistic message
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const beforeMessageIdRef = useRef<string | null>(null);
  // `connect` and `handleMessage` are mutually recursive (a socket's onmessage
  // dispatches to the handler; onclose re-enters connect to reconnect). Routing
  // both through refs breaks the declaration cycle and, importantly, keeps
  // `connect` from being re-created — and the socket torn down and rebuilt —
  // every time `handleMessage` closes over new `messages`.
  const handleMessageRef = useRef<(data: string) => void>(() => {});
  const connectRef = useRef<() => void>(() => {});

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (wsRef.current) wsRef.current.close(1000, "Component unmounted");
    };
  }, []);

  // ── WebSocket Connection ────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (!isMountedRef.current) return;

    setStatus("connecting");
    setError(null);

    const url = `${wsUrl}${bookingId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      reconnectCountRef.current = 0;
      setStatus("connected");
      setError(null);

      // Send join message
      ws.send(JSON.stringify({ type: "join", bookingId, token } as ClientToServerMessage));

      // Start heartbeat
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25_000);

      onConnect?.();
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      handleMessageRef.current(event.data);
    };

    ws.onclose = (event) => {
      if (!isMountedRef.current) return;
      setStatus("disconnected");
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

      const reason = event.reason || `Code: ${event.code}`;
      onDisconnect?.(reason);

      // Auto-reconnect
      if (reconnectCountRef.current < reconnectAttempts) {
        const delay = reconnectDelay * Math.pow(2, reconnectCountRef.current);
        reconnectCountRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) connectRef.current();
        }, delay);
      } else {
        setError(new Error(`Max reconnection attempts reached: ${reason}`));
        setStatus("error");
      }
    };

    ws.onerror = () => {
      if (!isMountedRef.current) return;
      const err = new Error("WebSocket error");
      setError(err);
      onError?.(err);
    };
  }, [
    bookingId,
    token,
    wsUrl,
    reconnectAttempts,
    reconnectDelay,
    onConnect,
    onDisconnect,
    onError,
  ]);

  // ── Message Handler ──────────────────────────────────────────────────────────

  const handleMessage = useCallback(
    (data: string) => {
      try {
        const msg: ServerToClientMessage = JSON.parse(data);

        switch (msg.type) {
          case "welcome": {
            setCurrentUser(msg.user);
            setUsers(msg.users);
            onPresenceChange?.(msg.users);
            break;
          }

          case "history": {
            // Prepend older messages (history comes oldest→newest)
            const newMessages = msg.messages.filter((m) => !messages.some((ex) => ex.id === m.id));
            setMessages((prev) => [...newMessages, ...prev]);
            setHasMoreHistory(msg.hasMore);
            if (newMessages.length > 0) {
              beforeMessageIdRef.current = newMessages[0].id;
            }
            break;
          }

          case "message": {
            // Check if this is our optimistic message being confirmed
            const optimistic = pendingMessagesRef.current.get(msg.message.id);
            if (optimistic) {
              pendingMessagesRef.current.delete(msg.message.id);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === optimistic.id ? { ...msg.message, optimistic: false } : m,
                ),
              );
            } else {
              // New message from another user
              setMessages((prev) => [...prev, msg.message]);
            }
            onMessage?.(msg.message);
            break;
          }

          case "messageAck": {
            // Optimistic message confirmed
            const optimistic = pendingMessagesRef.current.get(msg.tempId);
            if (optimistic) {
              pendingMessagesRef.current.delete(msg.tempId);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === optimistic.id ? { ...m, id: msg.messageId, pending: false } : m,
                ),
              );
            }
            break;
          }

          case "messageFailed": {
            const optimistic = pendingMessagesRef.current.get(msg.tempId);
            if (optimistic) {
              pendingMessagesRef.current.delete(msg.tempId);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === optimistic.id ? { ...m, failed: true, pending: false } : m,
                ),
              );
            }
            break;
          }

          case "presence": {
            setUsers(msg.users);
            onPresenceChange?.(msg.users);
            break;
          }

          case "userJoined": {
            setUsers((prev) =>
              prev.some((u) => u.userId === msg.user.userId) ? prev : [...prev, msg.user],
            );
            break;
          }

          case "userLeft": {
            setUsers((prev) => prev.filter((u) => u.userId !== msg.userId));
            break;
          }

          case "typing": {
            const { userId, userName, isTyping } = msg.typing;
            setTypingUsers((prev) => {
              const filtered = prev.filter((u) => u.userId !== userId);
              if (isTyping) {
                const user = users.find((u) => u.userId === userId) ?? {
                  userId,
                  name: userName,
                  role: "client" as const,
                  status: "online" as const,
                  lastSeen: new Date().toISOString(),
                  isTyping: true,
                };
                return [...filtered, user];
              }
              return filtered;
            });
            onTyping?.(msg.typing);
            break;
          }

          case "read": {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.messageId ? { ...m, readBy: [...(m.readBy ?? []), msg.userId] } : m,
              ),
            );
            break;
          }

          case "error": {
            const err: ChatError = new Error(msg.message);
            err.code = msg.code;
            setError(err);
            onError?.(err);
            break;
          }

          case "pong":
            // Heartbeat response - connection alive
            break;
        }
      } catch (e) {
        console.error("Failed to parse chat message:", e);
      }
    },
    [messages, users, onMessage, onPresenceChange, onTyping, onError],
  );

  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (body: string): Promise<ChatMessage | null> => {
      return new Promise((resolve, reject) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error("Not connected"));
          return;
        }

        const tempId = generateTempId();
        const optimisticMessage: ChatMessage = {
          id: tempId,
          bookingId,
          senderId: currentUser?.userId ?? "unknown",
          senderName: currentUser?.name ?? "You",
          senderRole: currentUser?.role ?? "client",
          body,
          createdAt: new Date().toISOString(),
          optimistic: true,
          pending: true,
        };

        // Add to pending and UI immediately
        pendingMessagesRef.current.set(tempId, optimisticMessage);
        setMessages((prev) => [...prev, optimisticMessage]);

        // Send via WebSocket
        ws.send(
          JSON.stringify({
            type: "message",
            bookingId,
            body,
            tempId,
          } as ClientToServerMessage),
        );

        // Resolve when acknowledged (handled in messageAck)
        const checkAck = setInterval(() => {
          if (!pendingMessagesRef.current.has(tempId)) {
            clearInterval(checkAck);
            const confirmed = messages.find((m) => m.id === tempId || m.tempId === tempId);
            resolve(confirmed ?? null);
          }
        }, 100);

        // Timeout after 10s
        setTimeout(() => {
          if (pendingMessagesRef.current.has(tempId)) {
            clearInterval(checkAck);
            pendingMessagesRef.current.delete(tempId);
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, failed: true, pending: false } : m)),
            );
            reject(new Error("Message send timeout"));
          }
        }, 10_000);
      });
    },
    [bookingId, currentUser, messages],
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "typing", bookingId, isTyping } as ClientToServerMessage));
      }
    },
    [bookingId],
  );

  const markRead = useCallback(
    (messageId: string) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "read", bookingId, messageId } as ClientToServerMessage));
      }
    },
    [bookingId],
  );

  const loadMoreHistory = useCallback(async () => {
    if (isLoadingHistory || !hasMoreHistory || !beforeMessageIdRef.current) return;

    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;

    setIsLoadingHistory(true);
    ws.send(
      JSON.stringify({
        type: "history",
        bookingId,
        before: beforeMessageIdRef.current,
        limit: maxHistoryMessages,
      } as ClientToServerMessage),
    );

    // Wait for history response (handled in handleMessage)
    // We'll use a timeout as fallback
    setTimeout(() => setIsLoadingHistory(false), 5_000);
  }, [bookingId, hasMoreHistory, isLoadingHistory, maxHistoryMessages]);

  const reconnect = useCallback(() => {
    reconnectCountRef.current = 0;
    if (wsRef.current) {
      wsRef.current.close(1000, "Manual reconnect");
    }
    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    if (wsRef.current) {
      wsRef.current.close(1000, "Manual disconnect");
      wsRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  // ── Auto-connect ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => disconnect();
  }, [autoConnect, connect, disconnect]);

  // ── Derived State ────────────────────────────────────────────────────────────

  const sortedMessages = useMemo(
    () =>
      messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages],
  );

  return {
    status,
    error,
    messages: sortedMessages,
    hasMoreHistory,
    isLoadingHistory,
    users,
    currentUser,
    typingUsers,
    sendMessage,
    sendTyping,
    markRead,
    loadMoreHistory,
    reconnect,
    disconnect,
  };
}

// ── Export types for consumers ────────────────────────────────────────────────

// Export types for consumers

export type { UseChatOptions, UseChatReturn };
export type { ChatMessage, UserPresence } from "./types";
