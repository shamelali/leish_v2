/**
 * Worker-side chat types.
 *
 * The wire protocol itself is defined once in `src/lib/chat/types.ts` and
 * re-exported here, so the Durable Object and the browser client cannot drift
 * apart — they previously did, and a `readBy` field existed on only one side.
 *
 * Only Cloudflare-specific bindings are declared in this file, because
 * `src/workers` is excluded from the app tsconfig and `@cloudflare/workers-types`
 * is not installed; keeping the protocol out of here means it still gets
 * typechecked by `pnpm typecheck`.
 */

export type {
  ChatMessage,
  ChatMessageInput,
  UserPresence,
  PresenceUpdate,
  TypingUpdate,
  ClientToServerMessage,
  ServerToClientMessage,
  BookingContext,
  ChatRoomState,
  ModerationAction,
  ChatConfig,
} from "@/lib/chat/types";

export { DEFAULT_CHAT_CONFIG } from "@/lib/chat/types";

// ── Worker Environment & Bindings ────────────────────────────────────────────

/**
 * The Durable Object's public surface, kept deliberately loose: typing the
 * namespace as `DurableObjectNamespace<ChatRoom>` here would make types.ts
 * import ChatRoom.ts, which imports types.ts back.
 */
export interface ChatRoomStub {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  CHAT_ROOM: DurableObjectNamespace<ChatRoomStub>;
  /** Auth validation — a service binding or an HTTP call to the main app. */
  AUTH_SERVICE?: Fetcher;
  /** Optional Analytics Engine dataset for chat metrics. */
  CHAT_ANALYTICS?: AnalyticsEngineDataset;
}
