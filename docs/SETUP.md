# Setup and operating notes

GoodBros is intended to run on a trusted local Windows host. It is not a managed service: the host PC, MongoDB, Node process, and Dev Tunnel must stay available for colleagues to connect.

## Environment

Copy `server/.env.example` to `server/.env`. Required values are `MONGODB_URI` and a private `JWT_SECRET` (32+ characters). Set `NODE_ENV=production` when running the production-like server. Express trusts the local tunnel proxy for HTTPS cookie handling. Do not publish `.env` or VAPID private keys.

## Install and run

Run `npm install` once at the root. Development is `npm run dev`; production-like use is `npm run build` followed by `npm start`. The production server binds to all local interfaces on port 5000 so VS Code can forward it. The Vite development server binds on port 5173 and proxies API and Socket.IO traffic to port 5000.

## Public access checklist

1. Confirm account registration and login locally.
2. In VS Code's Ports panel, forward port 5000 and set visibility to Public.
3. Test the generated HTTPS URL in a private browser window, including registration, login, sending a message, reloading, and logging out.
4. Configure VAPID keys separately if background push is desired.

Registration and login have rate limits; authorization is enforced server-side. Do not use a weak JWT secret, expose the MongoDB port publicly, or leave administrator credentials in terminal history on a shared computer. Back up MongoDB and the local uploads directory.

For administrator bootstrap or local password recovery, use `npm run admin:create -w server -- <email> <username> <full name>` or `npm run account:reset -w server -- <email>`. Both commands prompt for passwords without echoing them; password reset revokes all active sessions.

If a forwarded URL does not work, verify the Node process is listening on 5000, the port is Public, the host remains awake, and the tunnel URL is HTTPS. Socket.IO supports polling fallback when a proxy blocks WebSocket upgrade.
