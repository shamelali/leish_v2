/**
 * Chat wire protocol — the single definition shared by the browser client and
 * the Cloudflare Durable Object that implements it.
 *
 * This lives under src/lib (not src/workers) because src/workers is excluded
 * from the app tsconfig, so anything defined there is never typechecked by
 * `pnpm typecheck`. Keeping the protocol here means both sides of the wire are
 * checked against one definition. The Worker re-exports it from
 * src/workers/chat/types.ts, alongside its Cloudflare-only bindings.
 *
 * These types must stay platform-neutral: no Cloudflare globals, no DOM-only
 * types, so that both the Worker and the browser can compile against them.
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
  userId: string; // Client who booked
  artistId: string | null; // Artist assigned
  studioId: string | null; // Studio assigned
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
