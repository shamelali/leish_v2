# Leish Chat — Cloudflare Workers Durable Object

Real-time chat system for Leish v2 bookings, built with **WebSocket Hibernation** for massive scalability.

## 🏗 Architecture

```
┌─────────────────┐     WebSocket Hibernation      ┌──────────────────────┐
│   React Client  │ ◄─────────────────────────────► │   ChatRoom DO        │
│   (useChat)     │   (auto-reconnect, heartbeats) │   (per booking)      │
└─────────────────┘                                │                      │
                                                   │ • Embedded SQLite    │
                                                   │ • Presence tracking │
                                                   │ • Typing indicators │
                                                   │ • Read receipts     │
                                                   │ • Rate limiting     │
                                                   └──────────┬───────────┘
                                                              │
                                                    ┌─────────┴─────────┐
                                                    │ Analytics Engine  │
                                                    │ (metrics, events) │
                                                    └───────────────────┘
```

## ✨ Features

| Feature | Implementation |
|---------|----------------|
| **Real-time messaging** | WebSocket Hibernation API (millions of connections) |
| **Message persistence** | DO embedded SQLite (survives restarts, no external DB) |
| **Presence** | Online/away/offline with automatic timeout |
| **Typing indicators** | Broadcast with auto-clear timeout |
| **Read receipts** | Per-message, per-user |
| **Optimistic UI** | Instant send → server acknowledgment |
| **History pagination** | Infinite scroll with `before` cursor |
| **Auto-reconnect** | Exponential backoff (configurable) |
| **Rate limiting** | Per-connection sliding window |
| **Admin moderation** | Delete/flag/ban via REST API |
| **Analytics** | Workers Analytics Engine integration |

## 📦 Installation

### 1. Add to your project

```bash
# Copy the chat worker to your project
cp -r src/workers/chat /your-project/src/workers/
```

### 2. Configure `wrangler.jsonc`

```jsonc
{
  "name": "leish-chat",
  "main": "src/workers/chat/index.ts",
  "compatibility_date": "2025-03-07",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "durable_objects": {
    "bindings": [{ "name": "CHAT_ROOM", "class_name": "ChatRoom" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ChatRoom"] }],
  "vars": {
    "MAX_MESSAGE_LENGTH": "5000",
    "MAX_HISTORY_MESSAGES": "100",
    "PRESENCE_TIMEOUT_MS": "30000",
    "TYPING_TIMEOUT_MS": "5000"
  }
}
```

### 3. Deploy

```bash
npx wrangler deploy
```

### 4. Set environment variables

```bash
# In Cloudflare Dashboard or .dev.vars
NEXT_PUBLIC_CHAT_WS_URL=wss://leish-chat.your-subdomain.workers.dev/ws/
```

## 🔌 Client Integration (React)

### Basic Usage

```tsx
"use client";

import { ChatInterface } from "@/workers/chat";

export default function BookingChat({ bookingId, session }) {
  return (
    <ChatInterface
      bookingId={bookingId}
      token={session.token}
      wsUrl={process.env.NEXT_PUBLIC_CHAT_WS_URL!}
      style={{ height: "calc(100vh - 200px)" }}
      onMessage={(msg) => console.log("New message:", msg)}
      onPresenceChange={(users) => console.log("Presence:", users)}
    />
  );
}
```

### Custom Hook Usage

```tsx
import { useChat } from "@/workers/chat";

function CustomChat({ bookingId, token }) {
  const {
    messages,
    users,
    currentUser,
    typingUsers,
    status,
    sendMessage,
    sendTyping,
    loadMoreHistory,
    hasMoreHistory,
  } = useChat({
    bookingId,
    token,
    wsUrl: process.env.NEXT_PUBLIC_CHAT_WS_URL!,
    onMessage: (msg) => trackEvent("chat_message", msg),
  });

  return (
    <div>
      {/* Your custom UI */}
    </div>
  );
}
```

## 🔄 Migration from SSE (chat-bus.ts)

### Phase 1: Deploy Side-by-Side

```bash
# Deploy new worker alongside existing SSE
npx wrangler deploy
```

### Phase 2: Feature Flag Rollout

```typescript
// In your booking chat page
import { shouldUseNewChat } from "@/workers/chat";

const useNewChat = shouldUseNewChat(bookingId, userId);

// Render new or old chat based on flag
```

### Phase 3: Migrate Historical Messages

```typescript
// Run once via admin endpoint or script
import { migrateMessagesToDO } from "@/workers/chat";

await migrateMessagesToDO({
  bookingIds: ["booking-1", "booking-2"], // or all
  batchSize: 100,
  dryRun: false,
});
```

### Phase 4: Switch Traffic

```typescript
// Remove feature flag, always use new chat
const useNewChat = true;
```

### Phase 5: Cleanup

```bash
# Remove old code
rm src/server/chat-bus.ts
rm src/app/api/bookings/[id]/messages/stream/route.ts
```

## 🧪 Testing

### Unit Tests

```bash
npx vitest run src/workers/chat/ChatRoom.test.ts
```

### Integration Tests

```bash
# Start local dev
npx wrangler dev

# Run manual test scenarios in browser console
import { integrationTests } from "@/workers/chat/ChatRoom.test";
await integrationTests.testBasicConnection();
await integrationTests.testSendMessage();
await integrationTests.testMultipleUsers();
```

## 📊 Monitoring

### Analytics Engine Queries

```sql
-- Messages per booking per hour
SELECT
  blob1 as booking_id,
  COUNT(*) as message_count,
  DATE_TRUNC('hour', timestamp) as hour
FROM chat_events
WHERE blob1 = 'message_sent'
GROUP BY booking_id, hour
ORDER BY hour DESC;

-- Active users
SELECT
  blob1 as booking_id,
  COUNT(DISTINCT index1) as active_users
FROM chat_events
WHERE blob1 IN ('user_joined', 'message_sent')
  AND timestamp > NOW() - INTERVAL '24 HOURS'
GROUP BY booking_id;

-- Connection health
SELECT
  blob1 as event_type,
  COUNT(*) as count
FROM chat_events
WHERE timestamp > NOW() - INTERVAL '1 HOUR'
GROUP BY event_type;
```

### Logs

```bash
# View real-time logs
npx wrangler tail --format=pretty

# Filter by booking
npx wrangler tail --search "booking-123"
```

## 🔧 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_MESSAGE_LENGTH` | 5000 | Max characters per message |
| `MAX_HISTORY_MESSAGES` | 100 | Messages kept in memory (SQLite has all) |
| `PRESENCE_TIMEOUT_MS` | 30000 | Time before user marked offline |
| `TYPING_TIMEOUT_MS` | 5000 | Time before typing auto-clears |
| `CHAT_ROLLOUT_PERCENT` | 0 | Feature flag percentage (0-100) |

## 🚀 Performance

- **Cold start**: ~5ms (DO starts on first connection)
- **Memory per connection**: ~2KB (hibernated)
- **Message latency**: <10ms (same region)
- **Max connections per DO**: 10,000+ (limited by memory)
- **Horizontal scaling**: Automatic (one DO per booking)

## 🔐 Security

- **Authentication**: JWT token validated per connection
- **Authorization**: Booking ownership/artist claim verified
- **Rate limiting**: 30 msg/min per connection
- **Message sanitization**: Length limits, XSS-safe rendering
- **CORS**: Configurable origins

## 📝 API Reference

### WebSocket Messages

**Client → Server**
```typescript
// Join room
{ type: "join", bookingId: string, token: string }

// Send message
{ type: "message", bookingId: string, body: string, tempId: string }

// Typing indicator
{ type: "typing", bookingId: string, isTyping: boolean }

// Read receipt
{ type: "read", bookingId: string, messageId: string }

// History pagination
{ type: "history", bookingId: string, before?: string, limit?: number }

// Ping (heartbeat)
{ type: "ping" }
```

**Server → Client**
```typescript
// Welcome + initial state
{ type: "welcome", bookingId, user, users }

// Message history
{ type: "history", messages: ChatMessage[], hasMore: boolean }

// New message
{ type: "message", message: ChatMessage }

// Optimistic acknowledgment
{ type: "messageAck", tempId, messageId }

// Send failed
{ type: "messageFailed", tempId, error }

// Presence updates
{ type: "presence", users: UserPresence[] }
{ type: "userJoined", user: UserPresence }
{ type: "userLeft", userId }

// Typing
{ type: "typing", typing: TypingUpdate }

// Read receipt
{ type: "read", messageId, userId }

// Errors
{ type: "error", code, message }

// Pong
{ type: "pong" }
```

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ws/:bookingId` | WebSocket upgrade |
| GET | `/api/chat/history/:bookingId` | Paginated history |
| GET | `/api/chat/presence/:bookingId` | Current presence |
| POST | `/api/chat/validate` | Validate booking access |
| POST | `/api/chat/message` | Send message (fallback) |
| GET | `/api/chat/booking/:bookingId` | Booking context |
| GET | `/api/admin/chat/stats` | Global stats (admin) |
| POST | `/api/admin/chat/moderate` | Moderation actions (admin) |

## 🐛 Troubleshooting

### Connection fails
- Check `NEXT_PUBLIC_CHAT_WS_URL` is correct
- Verify token is valid and not expired
- Ensure booking exists and user has access

### Messages not appearing
- Check browser console for WebSocket errors
- Verify DO is deployed: `npx wrangler tail`
- Check rate limiting (30 msg/min)

### High latency
- Deploy worker closer to users (Cloudflare auto-routes)
- Check Analytics Engine for bottlenecks

### Presence not updating
- Verify heartbeat interval (25s)
- Check presence timeout (30s default)

## 📚 Related Files

```
src/workers/chat/
├── types.ts           # Shared TypeScript types
├── ChatRoom.ts        # Durable Object implementation
├── index.ts           # Worker entry point + REST API
├── useChat.ts         # React hook
├── ChatInterface.tsx  # Ready-to-use React component
├── migration.ts       # SSE → WebSocket migration utils
├── ChatRoom.test.ts   # Unit + integration tests
└── index-export.ts    # Main exports
```

## 🤝 Contributing

1. All changes must pass `npm run typecheck` and `npm run lint`
2. Add tests for new features
3. Update this README for API changes
4. Follow existing code style (no comments unless requested)

## 📄 License

Part of Leish v2 — Internal use only.