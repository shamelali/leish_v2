/**
 * Leish Chat Worker — Entry point for WebSocket connections
 *
 * Routes WebSocket upgrade requests to the appropriate ChatRoom Durable Object
 * based on the booking ID. Also provides REST endpoints for:
 * - Message history (pagination)
 * - Booking validation
 * - Admin operations
 */

import { ChatRoom } from "./ChatRoom"; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { Env, ChatMessage, UserPresence, BookingContext } from "./types";

interface ExtendedEnv extends Env {
  // Binding to the main Leish app for auth validation
  LEISH_APP: Fetcher;
  // Analytics
  CHAT_ANALYTICS: AnalyticsEngineDataset;
}

// ── CORS Headers ──────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(body: string | object, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function errorResponse(message: string, status = 400): Response {
  return corsResponse({ error: message }, status);
}

// ── Worker Entry Point ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: ExtendedEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ── WebSocket Upgrade Route ──────────────────────────────────────────────
    // GET /ws/:bookingId?token=...
    if (path.startsWith("/ws/") && request.headers.get("Upgrade") === "websocket") {
      const bookingId = path.slice(4); // Remove "/ws/"
      if (!bookingId) {
        return errorResponse("Booking ID required", 400);
      }

      // Forward to Durable Object
      const roomId = env.CHAT_ROOM.idFromName(`booking:${bookingId}`);
      const room = env.CHAT_ROOM.get(roomId);
      return room.fetch(request);
    }

    // ── REST API Routes ──────────────────────────────────────────────────────

    // GET /api/chat/history/:bookingId?before=&limit=
    if (path.startsWith("/api/chat/history/") && request.method === "GET") {
      return handleHistory(request, env, path);
    }

    // GET /api/chat/presence/:bookingId
    if (path.startsWith("/api/chat/presence/") && request.method === "GET") {
      return handlePresence(request, env, path);
    }

    // POST /api/chat/validate - Validate booking access
    if (path === "/api/chat/validate" && request.method === "POST") {
      return handleValidate(request, env);
    }

    // POST /api/chat/message - Send message via REST (fallback)
    if (path === "/api/chat/message" && request.method === "POST") {
      return handleSendMessage(request, env);
    }

    // POST /api/chat/messages/batch - Batch insert messages (for migration)
    if (path === "/api/chat/messages/batch" && request.method === "POST") {
      return handleBatchInsert(request, env);
    }

    // GET /api/chat/booking/:bookingId - Get booking context
    if (path.startsWith("/api/chat/booking/") && request.method === "GET") {
      return handleBookingContext(request, env, path);
    }

    // Admin endpoints
    if (path.startsWith("/api/admin/chat/")) {
      return handleAdmin(request, env, path);
    }

    // Health check
    if (path === "/health" && request.method === "GET") {
      return corsResponse({ status: "ok", service: "leish-chat" });
    }

    return errorResponse("Not found", 404);
  },
} satisfies ExportedHandler<ExtendedEnv>;

// ── Route Handlers ────────────────────────────────────────────────────────────

async function handleHistory(request: Request, env: ExtendedEnv, path: string): Promise<Response> {
  const bookingId = path.slice("/api/chat/history/".length);
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Authorization required", 401);
  }

  // Validate access
  const roomId = env.CHAT_ROOM.idFromName(`booking:${bookingId}`);
  const room = env.CHAT_ROOM.get(roomId);

  const validation = await room.fetch(
    new Request("https://internal/validate", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, action: "history", before, limit }),
    }),
  );

  if (!validation.ok) {
    return errorResponse("Unauthorized", 401);
  }

  const data = await validation.json<{ messages: ChatMessage[]; hasMore: boolean }>();
  return corsResponse(data);
}

async function handlePresence(request: Request, env: ExtendedEnv, path: string): Promise<Response> {
  const bookingId = path.slice("/api/chat/presence/".length);
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Authorization required", 401);
  }

  const roomId = env.CHAT_ROOM.idFromName(`booking:${bookingId}`);
  const room = env.CHAT_ROOM.get(roomId);

  const validation = await room.fetch(
    new Request("https://internal/presence", {
      method: "GET",
      headers: { Authorization: authHeader },
    }),
  );

  if (!validation.ok) {
    return errorResponse("Unauthorized", 401);
  }

  const data = await validation.json<{ users: UserPresence[] }>();
  return corsResponse(data);
}

async function handleValidate(request: Request, env: ExtendedEnv): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Authorization required", 401);
  }

  let body: { bookingId: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (!body.bookingId) {
    return errorResponse("bookingId required", 400);
  }

  // Call main Leish app to validate booking access
  try {
    const res = await env.LEISH_APP.fetch(`${new URL(request.url).origin}/api/chat/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ bookingId: body.bookingId }),
    });

    if (!res.ok) {
      return errorResponse("Unauthorized", res.status);
    }

    const data = await res.json<{ user: UserPresence; booking: BookingContext }>();
    return corsResponse(data);
  } catch (_e) {
    console.error("Validation error:", _e);
  }
}

async function handleSendMessage(request: Request, env: ExtendedEnv): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Authorization required", 401);
  }

  let body: { bookingId: string; body: string; tempId: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (!body.bookingId || !body.body || !body.tempId) {
    return errorResponse("bookingId, body, and tempId required", 400);
  }

  const roomId = env.CHAT_ROOM.idFromName(`booking:${body.bookingId}`);
  const room = env.CHAT_ROOM.get(roomId);

  const result = await room.fetch(
    new Request("https://internal/message", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  if (!result.ok) {
    const err = await result.json<{ error: string }>();
    return errorResponse(err.error ?? "Failed to send", result.status);
  }

  const data = await result.json<{ messageId: string; message: ChatMessage }>();
  return corsResponse(data);
}

async function handleBatchInsert(request: Request, env: ExtendedEnv): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Authorization required", 401);
  }

  let body: {
    bookingId: string;
    messages: Array<{
      id: string;
      booking_id: string;
      sender_id: string;
      body: string;
      created_at: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (!body.bookingId || !body.messages?.length) {
    return errorResponse("bookingId and messages required", 400);
  }

  const roomId = env.CHAT_ROOM.idFromName(`booking:${body.bookingId}`);
  const room = env.CHAT_ROOM.get(roomId);

  // Forward to DO for batch insert
  const result = await room.fetch(
    new Request("https://internal/batch-insert", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: body.messages }),
    }),
  );

  if (!result.ok) {
    const err = await result.json<{ error: string }>();
    return errorResponse(err.error ?? "Batch insert failed", result.status);
  }

  return corsResponse({ success: true, inserted: body.messages.length });
}

async function handleBookingContext(
  request: Request,
  env: ExtendedEnv,
  path: string,
): Promise<Response> {
  const bookingId = path.slice("/api/chat/booking/".length);
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Authorization required", 401);
  }

  try {
    const res = await env.LEISH_APP.fetch(
      `${new URL(request.url).origin}/api/bookings/${bookingId}`,
      {
        headers: { Authorization: authHeader },
      },
    );

    if (!res.ok) {
      return errorResponse("Booking not found", res.status);
    }

    const booking = await res.json<BookingContext>();
    return corsResponse(booking);
  } catch (_e) {
    return errorResponse("Failed to fetch booking", 500);
  }
}

async function handleAdmin(request: Request, env: ExtendedEnv, path: string): Promise<Response> {
  // Admin authentication check
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Admin authorization required", 401);
  }

  // Verify admin role via main app
  try {
    const res = await env.LEISH_APP.fetch(`${new URL(request.url).origin}/api/admin/me`, {
      headers: { Authorization: authHeader },
    });

    if (!res.ok) {
      return errorResponse("Admin access denied", 403);
    }
  } catch {
    return errorResponse("Admin validation failed", 500);
  }

  const adminPath = path.slice("/api/admin/chat/".length);

  // GET /api/admin/chat/stats - Global chat statistics
  if (adminPath === "stats" && request.method === "GET") {
    return corsResponse({
      totalRooms: "N/A (would need global index)",
      message: "Implement with Analytics Engine or separate index",
    });
  }

  // POST /api/admin/chat/moderate - Moderation actions
  if (adminPath === "moderate" && request.method === "POST") {
    let body: {
      bookingId: string;
      action: "delete" | "flag" | "ban";
      messageId: string;
      reason?: string;
    };
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }

    const roomId = env.CHAT_ROOM.idFromName(`booking:${body.bookingId}`);
    const room = env.CHAT_ROOM.get(roomId);

    const result = await room.fetch(
      new Request("https://internal/moderate", {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    return new Response(result.body, {
      status: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return errorResponse("Admin endpoint not found", 404);
}

// ── Export Durable Object ────────────────────────────────────────────────────

export { ChatRoom } from "./ChatRoom";
