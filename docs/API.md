# REST API

All routes are prefixed with `/api`. Protected routes require the HTTP-only `GoodBros` cookie. Unsafe requests validate the browser `Origin`; authentication and general API rate limits apply. JSON errors use `{ "error": "..." }`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Public registration |
| POST | `/auth/login` | Sign in with email or username |
| POST | `/auth/logout` | Revoke current session |
| GET | `/auth/me` | Current account |
| POST | `/auth/logout-others` | Revoke other sessions |
| GET | `/auth/sessions` | List this account's active sessions (no token values) |
| GET/PATCH | `/users/search`, `/users/:id`, `/users/profile`, `/users/preferences` | User lookup and preferences |
| PATCH/DELETE | `/users/password`, `/users/account` | Password and account management |
| GET/POST | `/conversations`, `/conversations/private`, `/conversations/group` | List or create conversations |
| GET/PATCH/DELETE | `/conversations/:id` | Conversation details and group administration |
| PATCH | `/conversations/:id/mute` | Mute an individual conversation |
| POST | `/conversations/:id/leave` | Leave a group |
| GET/POST | `/messages/:conversationId`, `/messages` | Paginated history and message send |
| PATCH/DELETE | `/messages/:id` | Edit or delete own message |
| POST | `/messages/:id/read` | Mark conversation messages read |
| GET/PATCH | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` | Notification center data |
| GET/POST/DELETE | `/push/public-key`, `/push/subscribe` | Web Push subscriptions |
| POST/GET | `/uploads`, `/uploads/:id` | Authorized upload/download |
| GET/PATCH | `/admin/users`, `/admin/users/:id/status` | Administrator account management |
| GET | `/admin/statistics` | Administrator statistics |

History supports `limit` (maximum 100), `before` (timestamp), and `q` (message content search) query parameters. Uploads are limited to 10 MB and an allowlist of image, PDF, text, DOC/DOCX, and XLS/XLSX MIME types.
