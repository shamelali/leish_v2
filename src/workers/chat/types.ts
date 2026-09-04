/**
 * Shared types for the Leish Chat system (Durable Objects + Client)
 */

// ── Core Message Types ────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  senderName: string;
  senderRole: "client" | "artist" | "studio" | "admin";
  body: string;
  createdAt: string;
  // Client-side only
  optimistic?: boolean;
  pending?: boolean;
  failed?: boolean;
  /** Client-assigned id for an optimistic message, echoed back on ack. */
  tempId?: string;
  readBy?: string[];
}

export interface ChatMessageInput {
  bookingId: string;
  body: string;
}

// ── Presence Types ────────────────────────────────────────────────────────────

export interface UserPresence {
  userId: string;
  name: string;
  role: "client" | "artist" | "studio" | "admin";
  status: "online" | "away" | "offline";
  lastSeen: string;
  isTyping: boolean;
  typingAt?: string;
}

export interface PresenceUpdate {
  type: "presence";
  bookingId: string;
  users: UserPresence[];
}

export interface TypingUpdate {
  type: "typing";
  bookingId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

// ── WebSocket Message Types (Client ↔ Server) ────────────────────────────────

export type ClientToServerMessage =
  | { type: "join"; bookingId: string; token: string }
  | { type: "message"; bookingId: string; body: string; tempId: string }
  | { type: "typing"; bookingId: string; isTyping: boolean }
  | { type: "read"; bookingId: string; messageId: string }
  | { type: "ping" }
  | { type: "history"; bookingId: string; before?: string; limit?: number };

export type ServerToClientMessage =
  | { type: "welcome"; bookingId: string; user: UserPresence; users: UserPresence[] }
  | { type: "history"; messages: ChatMessage[]; hasMore: boolean }
  | { type: "message"; message: ChatMessage }
  | { type: "messageAck"; tempId: string; messageId: string }
  | { type: "messageFailed"; tempId: string; error: string }
  | { type: "presence"; users: UserPresence[] }
  | { type: "userJoined"; user: UserPresence }
  | { type: "userLeft"; userId: string }
  | { type: "typing"; typing: TypingUpdate }
  | { type: "read"; messageId: string; userId: string }
  | { type: "error"; code: string; message: string }
  | { type: "pong" };

// ── Booking Context (for auth validation) ────────────────────────────────────

export interface BookingContext {
  id: string;
  userId: string;           // Client who booked
  artistId: string | null;  // Artist assigned
  studioId: string | null;  // Studio assigned
  status: string;
}

// ── Durable Object State ──────────────────────────────────────────────────────

export interface ChatRoomState {
  bookingId: string;
  messages: ChatMessage[];
  presence: Map<string, UserPresence>;
  typingUsers: Map<string, number>; // userId -> timeout handle
  messageSeq: number;
}

// ── Admin/Moderation ──────────────────────────────────────────────────────────

export interface ModerationAction {
  type: "delete" | "flag" | "ban";
  messageId: string;
  moderatorId: string;
  reason?: string;
}

// ── Configuration ─────────────────────────────────────────────────────────────

export interface ChatConfig {
  maxMessageLength: number;
  maxHistoryMessages: number;
  presenceTimeoutMs: number;
  typingTimeoutMs: number;
  rateLimitPerMinute: number;
  rateLimitBurst: number;
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  maxMessageLength: 5000,
  maxHistoryMessages: 100,
  presenceTimeoutMs: 30_000,
  typingTimeoutMs: 5_000,
  rateLimitPerMinute: 30,
  rateLimitBurst: 5,
};