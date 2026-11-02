import { parse as parseCookies } from 'cookie';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import { deliverPush } from '../push/deliver.js';

const messageSchema = z.object({
  conversationId: z.string().regex(/^[a-f\d]{24}$/i),
  clientMessageId: z.string().min(8).max(100),
  content: z.string().trim().max(4000).default(''),
  replyTo: z.string().regex(/^[a-f\d]{24}$/i).optional()
});

export function configureSocket(io) {
  const typingTimers = new Map();
  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin) {
        const originHost = new URL(origin).host.toLowerCase();
        const forwardedHost = socket.handshake.headers['x-forwarded-host']?.split(',')[0].trim().toLowerCase();
        const configuredHost = process.env.CLIENT_ORIGIN ? new URL(process.env.CLIENT_ORIGIN).host.toLowerCase() : null;
        if (originHost !== socket.handshake.headers.host?.toLowerCase() && originHost !== forwardedHost && originHost !== configuredHost) return next(new Error('Invalid origin.'));
      }
      const token = parseCookies(socket.handshake.headers.cookie || '').GoodBros;
      if (!token) return next(new Error('Authentication required.'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const [session, user] = await Promise.all([
        UserSession.findOne({ _id: payload.sid, userId: payload.sub, tokenHash, expiresAt: { $gt: new Date() } }),
        User.findOne({ _id: payload.sub, isActive: true })
      ]);
      if (!session || !user) return next(new Error('Session expired.'));
      socket.userId = String(user.id);
      socket.sessionId = String(session.id);
      socket.userName = user.fullName;
      next();
    } catch { next(new Error('Authentication required.')); }
  });

  io.on('connection', (socket) => {
    let eventTimes = [];
    socket.onAny(() => {
      const now = Date.now();
      eventTimes = eventTimes.filter(time => now - time < 60_000);
      if (eventTimes.length >= 300) socket.disconnect(true);
      else eventTimes.push(now);
    });
    const userRoom = `user:${socket.userId}`;
    socket.join(userRoom);
    const presenceSnapshot = () => [...new Set([...io.sockets.sockets.values()].map(connection => connection.userId))];
    socket.emit('presence:snapshot', { userIds: presenceSnapshot() });
    socket.on('presence:request', (acknowledge = () => {}) => acknowledge({ userIds: presenceSnapshot() }));
    const sessionRoom = `session:${socket.sessionId}`;
    socket.join(sessionRoom);
    const sessionCheck = setInterval(async () => {
      try {
        const valid = await UserSession.exists({ _id: socket.sessionId, userId: socket.userId, expiresAt: { $gt: new Date() } });
        const active = await User.exists({ _id: socket.userId, isActive: true });
        if (!valid || !active) socket.disconnect(true);
      } catch (error) {
        console.error('Socket session check failed:', error.message);
        socket.disconnect(true);
      }
    }, 60_000);
    const wasOnline = (io.sockets.adapter.rooms.get(userRoom)?.size || 0) > 1;
    if (!wasOnline) io.emit('user:online', { userId: socket.userId });

    socket.on('conversation:join', async (payload = {}, acknowledge = () => {}) => {
      if (!/^[a-f\d]{24}$/i.test(payload.conversationId || '')) return acknowledge({ error: 'Invalid conversation.' });
      const conversation = await Conversation.exists({ _id: payload.conversationId, participants: socket.userId });
      if (!conversation) return acknowledge({ error: 'Conversation access denied.' });
      socket.join(`conversation:${payload.conversationId}`);
      acknowledge({ success: true });
    });
    socket.on('conversation:leave', (payload = {}, acknowledge = () => {}) => {
      if (payload.conversationId) socket.leave(`conversation:${payload.conversationId}`);
      acknowledge({ success: true });
    });
    socket.on('typing:start', async (payload = {}) => {
      if (!/^[a-f\d]{24}$/i.test(payload.conversationId || '')) return;
      if (await Conversation.exists({ _id: payload.conversationId, participants: socket.userId })) {
        const key = `${payload.conversationId}:${socket.userId}`;
        clearTimeout(typingTimers.get(key));
        socket.to(`conversation:${payload.conversationId}`).emit('typing:start', { conversationId: payload.conversationId, userId: socket.userId, name: socket.userName });
        typingTimers.set(key, setTimeout(() => {
          typingTimers.delete(key);
          io.to(`conversation:${payload.conversationId}`).emit('typing:stop', { conversationId: payload.conversationId, userId: socket.userId });
        }, 4000));
      }
    });
    socket.on('typing:stop', async (payload = {}) => {
      if (payload.conversationId) {
        if (!(await Conversation.exists({ _id: payload.conversationId, participants: socket.userId }))) return;
        const key = `${payload.conversationId}:${socket.userId}`;
        clearTimeout(typingTimers.get(key));
        typingTimers.delete(key);
        socket.to(`conversation:${payload.conversationId}`).emit('typing:stop', { conversationId: payload.conversationId, userId: socket.userId });
      }
    });

    let messageTimes = [];
    socket.on('message:send', async (payload, acknowledge = () => {}) => {
      try {
        const now = Date.now();
        messageTimes = messageTimes.filter(time => now - time < 10_000);
        if (messageTimes.length >= 15) return acknowledge({ error: 'You are sending messages too quickly.' });
        messageTimes.push(now);
        const data = messageSchema.parse(payload);
        const conversation = await Conversation.findOne({ _id: data.conversationId, participants: socket.userId });
        if (!conversation) return acknowledge({ error: 'Conversation access denied.' });
        if (!data.content) return acknowledge({ error: 'Message cannot be empty.' });
        if (data.replyTo && !(await Message.exists({ _id: data.replyTo, conversationId: conversation.id }))) return acknowledge({ error: 'Reply target not found.' });
        const existed = await Message.exists({ conversationId: conversation.id, senderId: socket.userId, clientMessageId: data.clientMessageId });
        const message = await Message.findOneAndUpdate(
          { conversationId: conversation.id, senderId: socket.userId, clientMessageId: data.clientMessageId },
          { $setOnInsert: { content: data.content, messageType: 'text', replyTo: data.replyTo || null, readBy: [{ userId: socket.userId }] } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).populate('senderId', 'username fullName avatar').populate('replyTo', 'content senderId deletedAt');
        if (!existed) {
          conversation.lastMessage = message._id;
          conversation.updatedAt = new Date();
          await conversation.save();
        }
        if (!existed) {
          io.to(`conversation:${conversation.id}`).emit('message:new', { message });
          for (const recipientId of conversation.participants.filter(id => String(id) !== socket.userId)) {
            io.to(`user:${socket.userId}`).emit('message:delivered', { conversationId: conversation.id, messageId: message.id, userId: recipientId });
          }
        }
        acknowledge({ success: true, message });
        const recipients = existed ? [] : conversation.participants.filter(id => String(id) !== socket.userId);
        for (const recipientId of recipients) {
          const notification = await Notification.create({
            userId: recipientId, senderId: socket.userId, conversationId: conversation.id, messageId: message.id,
            title: conversation.type === 'group' ? conversation.groupInfo.name : socket.userName,
            body: data.content.slice(0, 180)
          });
          io.to(`user:${recipientId}`).emit('notification:new', { notification, message });
          deliverPush(io, recipientId, conversation.id, { title: notification.title, body: notification.body, conversationId: conversation.id, url: `/?conversation=${conversation.id}` })
            .catch(error => console.error('Push delivery failed:', error.message));
        }
      } catch (error) {
        acknowledge({ error: error.issues?.[0]?.message || 'Unable to send message.' });
      }
    });

    socket.on('disconnect', async () => {
      clearInterval(sessionCheck);
      for (const [key, timer] of typingTimers) {
        if (key.endsWith(`:${socket.userId}`)) {
          clearTimeout(timer);
          typingTimers.delete(key);
        }
      }
      const remaining = io.sockets.adapter.rooms.get(userRoom)?.size || 0;
      if (remaining === 0) {
        await User.updateOne({ _id: socket.userId }, { lastSeen: new Date() });
        io.emit('user:offline', { userId: socket.userId, lastSeen: new Date() });
      }
    });
  });
}
