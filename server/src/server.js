import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { configureSocket } from './socket/index.js';

const port = Number(process.env.PORT) || 5000;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

await connectDatabase(process.env.MONGODB_URI);
const server = createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'] });
app.set('io', io);
configureSocket(io);
server.listen(port, '0.0.0.0', () => console.log(`GoodBros server listening on port ${port}`));
