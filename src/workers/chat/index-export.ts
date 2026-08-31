/**
 * Leish Chat - Cloudflare Workers Durable Object
 *
 * Real-time chat system for Leish v2 bookings.
 * Replaces the SSE + Upstash chat-bus with WebSocket Hibernation.
 *
 * Exports:
 * - ChatRoom: Durable Object class
 * - useChat: React hook for client integration
 * - ChatInterface: Ready-to-use React component
 * - types: Shared TypeScript types
 * - migration: Migration utilities from old SSE system
 */

// Durable Object
export { ChatRoom } from "./ChatRoom";

// Worker entry point
export { default } from "./index";

// Client hooks & components
export { useChat, type UseChatOptions, type UseChatReturn } from "./useChat";
export { ChatInterface } from "./ChatInterface";

// Types
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
  ChatConfig,
  ModerationAction,
} from "./types";

export { DEFAULT_CHAT_CONFIG } from "./types";

// Migration utilities
export {
  migrateMessagesToDO,
  validateChatSystem,
  shouldUseNewChat,
  handleMigrationRequest,
  handleValidationRequest,
  DO_SCHEMA,
  initializeChatRoomDO,
  type MigrationResult,
  type MigrationOptions,
} from "./migration";

// ── Quick Start Guide ─────────────────────────────────────────────────────────
/*
 * DEPLOYMENT:
 * 1. Add wrangler.jsonc to your project root (or merge with existing)
 * 2. Deploy: npx wrangler deploy
 * 3. Set environment variables:
 *    - NEXT_PUBLIC_CHAT_WS_URL=wss://your-worker.your-subdomain.workers.dev/ws/
 *    - CHAT_ANALYTICS binding in wrangler.jsonc
 *
 * INTEGRATION (Next.js App Router):
 *
 * // app/bookings/[id]/chat/page.tsx
 * "use client";
 *
 * import { ChatInterface } from "@leish/chat";
 * import { getSession } from "@/lib/auth";
 *
 * export default async function BookingChatPage({ params }: { params: { id: string } }) {
 *   const session = await getSession();
 *   if (!session) redirect("/login");
 *
 *   return (
 *     <ChatInterface
 *       bookingId={params.id}
 *       token={session.token}
 *       wsUrl={process.env.NEXT_PUBLIC_CHAT_WS_URL!}
 *       style={{ height: "calc(100vh - 200px)" }}
 *     />
 *   );
 * }
 *
 * MIGRATION FROM SSE:
 * 1. Deploy new worker alongside existing SSE
 * 2. Use shouldUseNewChat() feature flag for gradual rollout
 * 3. Run migrateMessagesToDO() for historical data
 * 4. Switch ChatInterface to use new WebSocket URL
 * 5. Remove old SSE endpoint and chat-bus.ts
 *
 * ARCHITECTURE:
 * ┌─────────────┐     WebSocket      ┌──────────────────┐
 * │   Browser   │ ◄────────────────► │  ChatRoom DO     │
 * │  (React)    │   Hibernation      │  (per booking)   │
 * └─────────────┘                    │  - SQLite msgs   │
 *                                    │  - Presence      │
 *                                    │  - Typing        │
 *                                    └──────────────────┘
 *                                           │
 *                                    ┌──────┴──────┐
 *                                    │  Analytics  │
 *                                    │  Engine     │
 *                                    └─────────────┘
 */