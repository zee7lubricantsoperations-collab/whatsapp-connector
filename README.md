# WhatsApp Baileys Server

Deploy this to Railway to connect your PHP panel via QR code.

## Deploy to Railway

1. Create a new GitHub repo
2. Upload `baileys-server/` contents (package.json + index.js) to the repo root
3. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
4. Set port to `60001` in Railway settings (or it auto-detects from `process.env.PORT`)
5. Deploy

## Endpoints

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/qr` | GET | - | `{ connected, qr }` |
| `/status` | GET | - | `{ connected, status, hasQR }` |
| `/send-message` | POST | `{ phone, message }` | `{ success, messageId }` |
| `/send-image` | POST | `{ phone, imageUrl, caption }` | `{ success, messageId }` |
| `/logout` | POST | - | `{ success }` |

## Notes

- Auth session is stored in `auth_info/` folder on Railway (ephemeral - re-scan on redeploy)
- No `printQRInTerminal` - QR is served via `/qr` endpoint
- Auto-reconnects on disconnect
- Port defaults to `process.env.PORT` (Railway sets this automatically)
