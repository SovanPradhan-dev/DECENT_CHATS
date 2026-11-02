# Socket.IO events

Socket.IO shares the Express origin and authenticates from the HTTP-only session cookie. The server verifies session and conversation membership; client-supplied user IDs are not trusted. Events that mutate or access conversation state are validated server-side.

| Direction | Event | Payload / acknowledgement |
|---|---|---|
| Client → server | `conversation:join` | `{ conversationId }`; ack `{ success }` or `{ error }` |
| Client → server | `conversation:leave` | `{ conversationId }`; ack `{ success }` |
| Client → server | `message:send` | `{ conversationId, clientMessageId, content, replyTo? }`; ack includes saved message or error |
| Server → room | `message:new` | `{ message }`, emitted after MongoDB save |
| Server → sender | `message:sent` | `{ message }` for REST sends |
| Client → server | `typing:start`, `typing:stop` | `{ conversationId }`; typing is transient |
| Server → room | `typing:start`, `typing:stop` | Includes server-authenticated user identity |
| Server → users | `notification:new` | Persistent in-app notification and message |
| Server → clients | `user:online`, `user:offline` | `{ userId, lastSeen? }`; offline occurs after the final device disconnects |
| Server → room | `message:updated`, `message:deleted`, `message:read` | Persisted message state updates |

Message sends have a per-connection rate limit and are idempotent for a sender/conversation `clientMessageId`. Rooms are user-specific or membership-protected conversation rooms. Socket.IO uses WebSocket with HTTP long-polling fallback.
