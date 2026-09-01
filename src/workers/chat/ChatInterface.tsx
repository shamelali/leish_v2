/**
 * ChatInterface — Complete chat UI component using useChat hook
 *
 * Features:
 * - Message list with virtualization-ready structure
 * - Optimistic message rendering
 * - Typing indicators
 * - Presence avatars
 * - Auto-scroll to bottom
 * - Load more history on scroll
 * - Error/empty states
 * - Accessible markup
 */

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat, type ChatMessage, type UserPresence } from "./useChat";
import type { UseChatOptions } from "./useChat";

// ── Styles (using inline for portability, replace with your CSS solution) ─────

import type { CSSProperties } from "react";

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: "400px",
    background: "#1a1a2e",
    borderRadius: "12px",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#eaeaea",
  },
  header: {
    padding: "16px",
    borderBottom: "1px solid #2a2a4a",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    background: "#16213e",
  },
  title: { fontSize: "18px", fontWeight: 600, color: "#fff" },
  presence: { display: "flex", alignItems: "center", gap: "8px", flex: 1, justifyContent: "flex-end" },
  avatar: (color: string) => ({
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: 600,
    color: "#fff",
  } as CSSProperties),
  statusDot: (online: boolean) => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: online ? "#22c55e" : "#6b7280",
    marginLeft: "-8px",
    border: "2px solid #1a1a2e",
  } as CSSProperties),
  typingIndicator: {
    padding: "8px 16px",
    fontSize: "13px",
    color: "#9ca3af",
    minHeight: "20px",
    background: "#16213e",
    borderBottom: "1px solid #2a2a4a",
  },
  messagesContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  messageWrapper: (own: boolean) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: own ? "flex-end" : "flex-start",
    gap: "4px",
    maxWidth: "80%",
    alignSelf: own ? "flex-end" : "flex-start",
  } as CSSProperties),
  messageBubble: (own: boolean, pending: boolean, failed: boolean) => ({
    padding: "12px 16px",
    borderRadius: own ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
    background: own ? (pending ? "#374151" : failed ? "#7f1d1d" : "#2563eb") : "#2a2a4a",
    color: "#fff",
    position: "relative",
    opacity: pending ? 0.7 : 1,
    boxShadow: pending ? "0 0 0 1px #6b7280" : failed ? "0 0 0 1px #ef4444" : "none",
    transition: "all 0.2s ease",
  } as CSSProperties),
  messageMeta: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "11px",
    color: "#9ca3af",
    marginTop: "4px",
    padding: "0 4px",
  },
  senderName: { fontWeight: 500, color: "#d1d5db" },
  timestamp: { color: "#6b7280" },
  errorIcon: { color: "#ef4444", marginLeft: "4px" },
  loadMore: {
    padding: "16px",
    textAlign: "center",
    color: "#9ca3af",
    cursor: "pointer",
    userSelect: "none",
  },
  inputContainer: {
    padding: "16px",
    borderTop: "1px solid #2a2a4a",
    background: "#16213e",
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    minHeight: "44px",
    maxHeight: "150px",
    padding: "12px 16px",
    borderRadius: "22px",
    border: "1px solid #374151",
    background: "#0f172a",
    color: "#fff",
    fontSize: "15px",
    lineHeight: "1.5",
    resize: "none" as const,
    outline: "none",
    fontFamily: "inherit",
  },
  sendButton: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    background: "#2563eb",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
  },
  sendButtonDisabled: { opacity: 0.5, cursor: "not-allowed" },
  statusBar: {
    padding: "8px 16px",
    fontSize: "12px",
    color: "#9ca3af",
    borderTop: "1px solid #2a2a4a",
    background: "#16213e",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  connectionStatus: (status: string) => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: status === "connected" ? "#22c55e" : status === "connecting" ? "#f59e0b" : "#ef4444",
  }),
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    gap: "8px",
    padding: "32px",
    textAlign: "center",
  },
};

// ── Helper Functions ──────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getColorForName(name: string): string {
  const colors = [
    "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#14b8a6",
    "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Components ────────────────────────────────────────────────────────────────

interface MessageProps {
  message: ChatMessage;
  currentUserId: string | null;
  users: UserPresence[];
}

function Message({ message, currentUserId, users }: MessageProps) {
  const isOwn = message.senderId === currentUserId;
  const sender = users.find((u) => u.userId === message.senderId);
  const color = sender ? getColorForName(sender.name) : getColorForName(message.senderName);

  return (
    <div style={styles.messageWrapper(isOwn)}>
      {!isOwn && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
          <div style={styles.avatar(color)}>{getInitials(message.senderName)}</div>
          <span style={styles.senderName}>{message.senderName}</span>
        </div>
      )}
      <div style={styles.messageBubble(isOwn, message.pending ?? false, message.failed ?? false)}>
        <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>{message.body}</div>
        {message.failed && (
          <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
            <span style={{ color: "#ef4444", fontSize: "13px" }}>Failed to send</span>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("chat-retry", { detail: message.id }))}
              style={{ padding: "4px 8px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
      <div style={styles.messageMeta}>
        <span style={styles.timestamp}>{formatTime(message.createdAt)}</span>
        {message.pending && <span style={{ color: "#f59e0b", fontSize: "10px" }}>Sending...</span>}
        {message.failed && <span style={styles.errorIcon}>⚠</span>}
      </div>
    </div>
  );
}

interface TypingIndicatorProps {
  typingUsers: UserPresence[];
  currentUserId: string | null;
}

function TypingIndicator({ typingUsers, currentUserId }: TypingIndicatorProps) {
  const others = typingUsers.filter((u) => u.userId !== currentUserId);
  if (others.length === 0) return null;

  const names = others.map((u) => u.name).join(", ");
  const text = others.length === 1 ? `${names} is typing...` : `${names} are typing...`;

  return (
    <div style={styles.typingIndicator}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "12px" }}>{text}</span>
        <span className="typing-dots" style={{ display: "inline-flex", gap: "2px" }}>
          <span style={{ animation: "typing 1.4s infinite ease-in-out 0s" }}>●</span>
          <span style={{ animation: "typing 1.4s infinite ease-in-out 0.2s" }}>●</span>
          <span style={{ animation: "typing 1.4s infinite ease-in-out 0.4s" }}>●</span>
        </span>
      </span>
      <style jsx>{`
        @keyframes typing {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Main ChatInterface Component ──────────────────────────────────────────────

interface ChatInterfaceProps extends Omit<UseChatOptions, "bookingId" | "token" | "wsUrl"> {
  bookingId: string;
  token: string;
  wsUrl?: string; // Optional, defaults to env variable
  className?: string;
  style?: React.CSSProperties;
}

export function ChatInterface({
  bookingId,
  token,
  wsUrl = process.env.NEXT_PUBLIC_CHAT_WS_URL ?? "wss://chat.leish.my/ws/",
  className,
  style,
  ...callbacks
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showLoadMore, setShowLoadMore] = useState(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const {
    status,
    error,
    messages,
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
  } = useChat({
    bookingId,
    token,
    wsUrl,
    ...callbacks,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Detect scroll to top for loading more history
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container && container.scrollTop === 0 && hasMoreHistory && !isLoadingHistory) {
      setShowLoadMore(true);
    }
  }, [hasMoreHistory, isLoadingHistory]);

  const handleLoadMoreClick = useCallback(() => {
    setShowLoadMore(false);
    loadMoreHistory();
  }, [loadMoreHistory]);

  // Typing debounce
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      sendTyping(value.length > 0);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTyping(false), 3000);
    },
    [sendTyping]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const textarea = form.elements.namedItem("message") as HTMLTextAreaElement;
      const body = textarea.value.trim();
      if (!body) return;

      textarea.value = "";
      sendTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      try {
        await sendMessage(body);
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    [sendMessage, sendTyping]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        (e.currentTarget.form?.requestSubmit?.() ?? e.currentTarget.form?.dispatchEvent(new Event("submit")));
      }
    },
    []
  );

  // Retry failed messages
  useEffect(() => {
    const handleRetry = (event: CustomEvent) => {
      const messageId = event.detail;
      const message = messages.find((m) => m.id === messageId);
      if (message?.failed && !message.pending) {
        // Resend logic would go here
      }
    };
    window.addEventListener("chat-retry", handleRetry as EventListener);
    return () => window.removeEventListener("chat-retry", handleRetry as EventListener);
  }, [messages]);

  // Connection status text
  const statusText = useMemo(() => {
    switch (status) {
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Connected";
      case "disconnected":
        return "Disconnected";
      case "error":
        return `Error: ${error?.message ?? "Unknown"}`;
      default:
        return "Unknown";
    }
  }, [status, error]);

  return (
    <div style={{ ...styles.container, ...style }} className={className}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Chat</h2>
        <div style={styles.presence}>
          {users.slice(0, 5).map((user) => (
            <div key={user.userId} style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <div style={styles.avatar(getColorForName(user.name))}>{getInitials(user.name)}</div>
              <div style={styles.statusDot(user.status === "online")} />
            </div>
          ))}
          {users.length > 5 && (
            <span style={{ color: "#9ca3af", fontSize: "13px", marginLeft: "8px" }}>
              +{users.length - 5} more
            </span>
          )}
        </div>
      </div>

      {/* Typing Indicator */}
      <TypingIndicator typingUsers={typingUsers} currentUserId={currentUser?.userId ?? null} />

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        style={styles.messagesContainer}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {showLoadMore && hasMoreHistory && (
          <div
            ref={loadMoreTriggerRef}
            style={styles.loadMore}
            onClick={handleLoadMoreClick}
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handleLoadMoreClick()}
          >
            {isLoadingHistory ? "Loading..." : "Load more messages"}
          </div>
        )}

        {messages.length === 0 && status === "connected" && (
          <div style={styles.emptyState}>
            <div style={{ fontSize: "48px" }}>💬</div>
            <p>No messages yet. Start the conversation!</p>
          </div>
        )}

        {messages.map((message) => (
          <Message key={message.id} message={message} currentUserId={currentUser?.userId ?? null} users={users} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <div style={styles.connectionStatus(status)}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: status === "connected" ? "#22c55e" : status === "connecting" ? "#f59e0b" : "#ef4444",
            }}
          />
          {statusText}
        </div>
        {status === "error" && (
          <button onClick={reconnect} style={{ marginLeft: "auto", padding: "4px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>
            Reconnect
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: "11px" }}>
          {users.filter((u) => u.status === "online").length} online
        </span>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={styles.inputContainer}>
        <textarea
          name="message"
          style={styles.textarea}
          placeholder="Type a message..."
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          disabled={status !== "connected"}
          rows={1}
          aria-label="Chat message"
        />
        <button
          type="submit"
          style={{
            ...styles.sendButton,
            ...(status !== "connected" ? styles.sendButtonDisabled : {}),
          }}
          disabled={status !== "connected"}
          aria-label="Send message"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </form>
    </div>
  );
}

// ── Export for easy importing ────────────────────────────────────────────────

export { useChat } from "./useChat";
export type { ChatMessage, UserPresence } from "./types";