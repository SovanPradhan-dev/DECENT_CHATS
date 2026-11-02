import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import PushSubscription from '../models/PushSubscription.js';
import Attachment from '../models/Attachment.js';
import { deliverPush } from '../push/deliver.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads');
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
const userView = (user) => ({ id: user._id, username: user.username, fullName: user.fullName, email: user.email, avatar: user.avatar, bio: user.bio, role: user.role, preferences: user.preferences, lastSeen: user.lastSeen, createdAt: user.createdAt });
const publicUserView = (user) => ({ id: user._id, username: user.username, fullName: user.fullName, avatar: user.avatar, bio: user.bio, lastSeen: user.lastSeen, createdAt: user.createdAt });
const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');
const validId = (id) => idSchema.safeParse(id).success;
const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error(result.error.issues[0]?.message || 'Invalid request.');
    error.status = 400;
    throw error;
  }
  return result.data;
};
const cookieSecure = (req) => process.env.NODE_ENV === 'production' || req.secure;
const expireCookie = (req, res) => res.clearCookie('GoodBros', { httpOnly: true, secure: cookieSecure(req), sameSite: 'lax', path: '/' });
const setCookie = (req, res, token, expires) => res.cookie('GoodBros', token, {
  httpOnly: true, secure: cookieSecure(req), sameSite: 'lax', path: '/',
  expires, maxAge: expires.getTime() - Date.now()
});
const sendToken = async (res, user, req, remember = true) => {
  const expiresAt = new Date(Date.now() + (remember ? 30 : 12 / 24) * 24 * 60 * 60 * 1000);
  const session = await UserSession.create({ userId: user._id, tokenHash: randomBytes(32).toString('hex'), deviceName: req.get('user-agent')?.slice(0, 150) || 'Browser', expiresAt });
  const token = jwt.sign({ sub: user.id, sid: session.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
  session.tokenHash = createHash('sha256').update(token).digest('hex');
  await session.save();
  setCookie(req, res, token, expiresAt);
};
const membership = async (conversationId, userId) => Conversation.findOne({ _id: conversationId, participants: userId });
const privateKey = (a, b) => [String(a), String(b)].sort().join(':');

router.post('/auth/register', authLimit, asyncHandler(async (req, res) => {
  const data = parse(z.object({
    fullName: z.string().trim().min(2).max(80),
    username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/, 'Username must be 3–24 letters, numbers, or underscores.'),
    email: z.string().trim().email().max(254),
    password: z.string().min(10).max(128),
    acceptedTerms: z.literal(true)
  }), req.body);
  if (/^(admin|administrator|root|support|GoodBros)$/i.test(data.username)) return res.status(400).json({ error: 'That username is reserved.' });
  const normalizedUsername = data.username.toLowerCase();
  const normalizedEmail = data.email.toLowerCase();
  if (await User.exists({ $or: [{ normalizedUsername }, { normalizedEmail }] })) return res.status(409).json({ error: 'That username or email is already in use.' });
  const user = await User.create({
    username: data.username, normalizedUsername, fullName: data.fullName, email: data.email,
    normalizedEmail, passwordHash: await bcrypt.hash(data.password, 12)
  });
  await sendToken(res, user, req);
  res.status(201).json({ user: userView(user) });
}));

router.post('/auth/login', authLimit, asyncHandler(async (req, res) => {
  const data = parse(z.object({ identity: z.string().trim().min(1).max(254), password: z.string().min(1).max(128), remember: z.boolean().optional() }), req.body);
  const identity = data.identity.toLowerCase();
  const user = await User.findOne({ $or: [{ normalizedEmail: identity }, { normalizedUsername: identity }] }).select('+passwordHash');
  if (!user || !user.isActive || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: 'The email/username or password is incorrect.' });
  await sendToken(res, user, req, data.remember !== false);
  res.json({ user: userView(user) });
}));

router.post('/auth/logout', authRequired, asyncHandler(async (req, res) => {
  await req.session.deleteOne();
  req.app.get('io').in(`session:${req.session.id}`).disconnectSockets(true);
  expireCookie(req, res);
  res.json({ success: true });
}));
router.get('/auth/me', authRequired, (req, res) => res.json({ user: userView(req.user) }));
router.get('/auth/sessions', authRequired, asyncHandler(async (req, res) => {
  const sessions = await UserSession.find({ userId: req.user.id }).select('deviceName createdAt expiresAt').sort({ createdAt: -1 });
  res.json({ sessions: sessions.map(session => ({ id: session.id, deviceName: session.deviceName, createdAt: session.createdAt, expiresAt: session.expiresAt, current: session.id === req.session.id })) });
}));
router.post('/auth/logout-others', authRequired, asyncHandler(async (req, res) => {
  const sessions = await UserSession.find({ userId: req.user.id, _id: { $ne: req.session.id } }).select('_id');
  await UserSession.deleteMany({ userId: req.user.id, _id: { $ne: req.session.id } });
  for (const session of sessions) req.app.get('io').in(`session:${session.id}`).disconnectSockets(true);
  res.json({ success: true });
}));

router.get('/users/search', authRequired, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.json({ users: [] });
  const users = await User.find({ isActive: true, _id: { $ne: req.user.id }, $or: [
    { normalizedUsername: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase() } },
    { fullName: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
  ] }).limit(15);
  res.json({ users: users.map(publicUserView) });
}));
router.get('/users/:id', authRequired, asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid user id.' });
  const user = await User.findOne({ _id: req.params.id, isActive: true });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicUserView(user) });
}));
router.patch('/users/profile', authRequired, asyncHandler(async (req, res) => {
  const data = parse(z.object({ fullName: z.string().trim().min(2).max(80).optional(), username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/).optional(), bio: z.string().trim().max(240).optional() }).strict(), req.body);
  if (data.username) {
    const normalizedUsername = data.username.toLowerCase();
    if (await User.exists({ normalizedUsername, _id: { $ne: req.user.id } })) return res.status(409).json({ error: 'That username is already in use.' });
    req.user.username = data.username;
    req.user.normalizedUsername = normalizedUsername;
  }
  if (data.fullName !== undefined) req.user.fullName = data.fullName;
  if (data.bio !== undefined) req.user.bio = data.bio;
  await req.user.save();
  res.json({ user: userView(req.user) });
}));
router.patch('/users/preferences', authRequired, asyncHandler(async (req, res) => {
  const data = parse(z.object({
    theme: z.enum(['dark', 'light']).optional(),
    desktopNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    notificationSound: z.boolean().optional()
  }).strict(), req.body);
  for (const [key, value] of Object.entries(data)) req.user.preferences[key] = value;
  await req.user.save();
  res.json({ preferences: req.user.preferences });
}));
router.patch('/conversations/:id/mute', authRequired, asyncHandler(async (req, res) => {
  const { muted } = parse(z.object({ muted: z.boolean() }), req.body);
  const conversation = await membership(req.params.id, req.user.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  const mutedIds = req.user.preferences.mutedConversations;
  if (muted) mutedIds.addToSet(conversation._id);
  else mutedIds.pull(conversation._id);
  await req.user.save();
  res.json({ muted });
}));
router.patch('/users/password', authRequired, asyncHandler(async (req, res) => {
  const data = parse(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(128) }), req.body);
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!(await bcrypt.compare(data.currentPassword, user.passwordHash))) return res.status(400).json({ error: 'Current password is incorrect.' });
  user.passwordHash = await bcrypt.hash(data.newPassword, 12);
  await user.save();
  const otherSessions = await UserSession.find({ userId: user.id, _id: { $ne: req.session.id } }).select('_id');
  await UserSession.deleteMany({ userId: user.id, _id: { $ne: req.session.id } });
  for (const session of otherSessions) req.app.get('io').in(`session:${session.id}`).disconnectSockets(true);
  res.json({ success: true });
}));
router.delete('/users/account', authRequired, asyncHandler(async (req, res) => {
  await Promise.all([
    User.deleteOne({ _id: req.user.id }), UserSession.deleteMany({ userId: req.user.id }),
    PushSubscription.deleteMany({ userId: req.user.id }), Conversation.updateMany({ participants: req.user.id }, { $pull: { participants: req.user.id, 'groupInfo.admins': req.user.id } })
  ]);
  req.app.get('io').in(`user:${req.user.id}`).disconnectSockets(true);
  expireCookie(req, res);
  res.json({ success: true });
}));

router.get('/conversations', authRequired, asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ participants: req.user.id })
    .sort({ updatedAt: -1 }).populate('participants', 'username fullName avatar lastSeen').populate({ path: 'lastMessage', populate: { path: 'senderId', select: 'username fullName' } });
  const unread = await Message.aggregate([
    { $match: { conversationId: { $in: conversations.map(c => c._id) }, senderId: { $ne: req.user._id }, 'readBy.userId': { $ne: req.user._id }, deletedAt: null } },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } }
  ]);
  const unreadMap = new Map(unread.map(item => [String(item._id), item.count]));
  res.json({ conversations: conversations.map(c => ({ ...c.toObject(), unreadCount: unreadMap.get(String(c._id)) || 0 })) });
}));
router.post('/conversations/private', authRequired, asyncHandler(async (req, res) => {
  const data = parse(z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) }), req.body);
  if (data.userId === req.user.id) return res.status(400).json({ error: 'You cannot start a conversation with yourself.' });
  const other = await User.findOne({ _id: data.userId, isActive: true });
  if (!other) return res.status(404).json({ error: 'User not found.' });
  const key = privateKey(req.user.id, other.id);
  const conversation = await Conversation.findOneAndUpdate({ privateKey: key }, { $setOnInsert: { type: 'private', privateKey: key, participants: [req.user.id, other.id] } }, { upsert: true, new: true, setDefaultsOnInsert: true })
    .populate('participants', 'username fullName avatar lastSeen');
  res.status(200).json({ conversation });
}));
router.post('/conversations/group', authRequired, asyncHandler(async (req, res) => {
  const data = parse(z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional(), memberIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(49).default([]) }), req.body);
  const ids = [...new Set([req.user.id, ...data.memberIds])];
  const users = await User.find({ _id: { $in: ids }, isActive: true });
  if (users.length !== ids.length) return res.status(400).json({ error: 'One or more selected users are unavailable.' });
  const conversation = await Conversation.create({ type: 'group', participants: ids, groupInfo: { name: data.name, description: data.description || '', admins: [req.user.id] } });
  await conversation.populate('participants', 'username fullName avatar lastSeen');
  for (const id of ids) req.app.get('io').to(`user:${id}`).emit('group:created', { conversation });
  res.status(201).json({ conversation });
}));
router.get('/conversations/:id', authRequired, asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid conversation id.' });
  const conversation = await membership(req.params.id, req.user.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  await conversation.populate('participants', 'username fullName avatar lastSeen');
  res.json({ conversation });
}));
router.patch('/conversations/:id', authRequired, asyncHandler(async (req, res) => {
  const conversation = await membership(req.params.id, req.user.id);
  if (!conversation || conversation.type !== 'group') return res.status(404).json({ error: 'Group not found.' });
  if (!conversation.groupInfo.admins.some(id => String(id) === req.user.id)) return res.status(403).json({ error: 'Only group administrators can update group details.' });
  const data = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(300).optional(), addMemberIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(49).optional(), removeMemberId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict(), req.body);
  const addedIds = [];
  if (data.name) conversation.groupInfo.name = data.name;
  if (data.description !== undefined) conversation.groupInfo.description = data.description;
  if (data.addMemberIds?.length) {
    const ids = [...new Set(data.addMemberIds)];
    const users = await User.find({ _id: { $in: ids }, isActive: true });
    if (users.length !== ids.length) return res.status(400).json({ error: 'One or more users are unavailable.' });
    addedIds.push(...ids.filter(id => !conversation.participants.some(member => String(member) === id)));
    conversation.participants.addToSet(...ids);
  }
  if (data.removeMemberId) {
    if (data.removeMemberId === req.user.id) return res.status(400).json({ error: 'Use leave group to remove yourself.' });
    if (!conversation.participants.some(member => String(member) === data.removeMemberId)) return res.status(404).json({ error: 'Group member not found.' });
    conversation.participants.pull(data.removeMemberId);
    conversation.groupInfo.admins.pull(data.removeMemberId);
  }
  await conversation.save();
  await conversation.populate('participants', 'username fullName avatar lastSeen');
  if (data.removeMemberId) {
    const sockets = await req.app.get('io').in(`user:${data.removeMemberId}`).fetchSockets();
    for (const socket of sockets) socket.leave(`conversation:${conversation.id}`);
  }
  for (const id of addedIds) req.app.get('io').to(`user:${id}`).emit('group:member-added', { conversationId: conversation.id, userId: id });
  if (data.removeMemberId) req.app.get('io').to(`user:${data.removeMemberId}`).emit('group:member-removed', { conversationId: conversation.id, userId: data.removeMemberId });
  req.app.get('io').to(`conversation:${conversation.id}`).emit('group:updated', { conversation });
  res.json({ conversation });
}));
router.delete('/conversations/:id', authRequired, asyncHandler(async (req, res) => {
  const conversation = await membership(req.params.id, req.user.id);
  if (!conversation || conversation.type !== 'group') return res.status(404).json({ error: 'Group not found.' });
  if (!conversation.groupInfo.admins.some(id => String(id) === req.user.id)) return res.status(403).json({ error: 'Only group administrators can delete a group.' });
  req.app.get('io').to(`conversation:${conversation.id}`).emit('group:deleted', { conversationId: conversation.id });
  await Conversation.deleteOne({ _id: conversation.id });
  await Message.deleteMany({ conversationId: conversation.id });
  res.json({ success: true });
}));
router.post('/conversations/:id/leave', authRequired, asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, type: 'group', participants: req.user.id });
  if (!conversation) return res.status(404).json({ error: 'Group not found.' });
  conversation.participants.pull(req.user.id);
  conversation.groupInfo.admins.pull(req.user.id);
  req.app.get('io').to(`user:${req.user.id}`).emit('group:member-removed', { conversationId: conversation.id, userId: req.user.id });
  const sockets = await req.app.get('io').in(`user:${req.user.id}`).fetchSockets();
  for (const socket of sockets) socket.leave(`conversation:${conversation.id}`);
  if (!conversation.groupInfo.admins.length && conversation.participants.length) conversation.groupInfo.admins.push(conversation.participants[0]);
  if (!conversation.participants.length) {
    await Promise.all([Conversation.deleteOne({ _id: conversation.id }), Message.deleteMany({ conversationId: conversation.id })]);
    return res.json({ success: true });
  }
  await conversation.save();
  await conversation.populate('participants', 'username fullName avatar lastSeen');
  req.app.get('io').to(`conversation:${conversation.id}`).emit('group:updated', { conversation });
  res.json({ success: true });
}));

router.get('/messages/:conversationId', authRequired, asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  if (!validId(conversationId) || !(await membership(conversationId, req.user.id))) return res.status(404).json({ error: 'Conversation not found.' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  const query = { conversationId };
  if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) query.createdAt = { $lt: new Date(req.query.before) };
  if (req.query.q) query.content = { $regex: String(req.query.q).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit).populate('senderId', 'username fullName avatar').populate('replyTo', 'content senderId deletedAt').populate('attachment', 'originalName mimeType size');
  res.json({ messages: messages.reverse(), hasMore: messages.length === limit });
}));
router.post('/messages', authRequired, asyncHandler(async (req, res) => {
  const data = parse(z.object({ conversationId: z.string().regex(/^[a-f\d]{24}$/i), clientMessageId: z.string().min(8).max(100), content: z.string().trim().max(4000).default(''), replyTo: z.string().regex(/^[a-f\d]{24}$/i).optional(), attachmentId: z.string().regex(/^[a-f\d]{24}$/i).optional() }), req.body);
  const conversation = await membership(data.conversationId, req.user.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  if (!data.content && !data.attachmentId) return res.status(400).json({ error: 'Write a message or attach a file.' });
  if (data.replyTo && !(await Message.exists({ _id: data.replyTo, conversationId: conversation.id }))) return res.status(400).json({ error: 'Reply target not found.' });
  let attachment = null;
  if (data.attachmentId) {
    attachment = await Attachment.findOne({ _id: data.attachmentId, ownerId: req.user.id, conversationId: conversation.id });
    if (!attachment) return res.status(400).json({ error: 'Attachment is unavailable.' });
  }
  const existed = await Message.exists({ conversationId: conversation.id, senderId: req.user.id, clientMessageId: data.clientMessageId });
  const message = await Message.findOneAndUpdate(
    { conversationId: conversation.id, senderId: req.user.id, clientMessageId: data.clientMessageId },
    { $setOnInsert: { content: data.content, messageType: attachment ? 'file' : 'text', attachment: attachment?._id || null, replyTo: data.replyTo || null, readBy: [{ userId: req.user.id }] } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate('senderId', 'username fullName avatar').populate('replyTo', 'content senderId deletedAt').populate('attachment', 'originalName mimeType size');
  if (!existed) {
    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();
  }
  const io = req.app.get('io');
  if (!existed) {
    io.to(`conversation:${conversation.id}`).emit('message:new', { message });
    io.to(`user:${req.user.id}`).emit('message:sent', { message });
  }
  const recipients = existed ? [] : conversation.participants.filter(id => String(id) !== req.user.id);
  for (const recipientId of recipients) {
    const notification = await Notification.create({
      userId: recipientId, senderId: req.user.id, conversationId: conversation.id, messageId: message.id,
      title: conversation.type === 'group' ? conversation.groupInfo.name : req.user.fullName,
      body: data.content.slice(0, 180) || 'Shared an attachment'
    });
    io.to(`user:${recipientId}`).emit('notification:new', { notification, message });
    deliverPush(io, recipientId, conversation.id, {
      title: notification.title, body: notification.body, conversationId: conversation.id, url: `/?conversation=${conversation.id}`
    }).catch(error => console.error('Push delivery failed:', error.message));
  }
  res.status(201).json({ message });
}));
router.patch('/messages/:id', authRequired, asyncHandler(async (req, res) => {
  const data = parse(z.object({ content: z.string().trim().min(1).max(4000) }), req.body);
  const message = await Message.findOne({ _id: req.params.id, senderId: req.user.id, deletedAt: null });
  if (!message) return res.status(404).json({ error: 'Message not found or cannot be edited.' });
  message.content = data.content;
  message.editedAt = new Date();
  await message.save();
  await message.populate('senderId', 'username fullName avatar');
  req.app.get('io').to(`conversation:${message.conversationId}`).emit('message:updated', { message });
  res.json({ message });
}));
router.delete('/messages/:id', authRequired, asyncHandler(async (req, res) => {
  const message = await Message.findOne({ _id: req.params.id, senderId: req.user.id, deletedAt: null });
  if (!message) return res.status(404).json({ error: 'Message not found or cannot be deleted.' });
  message.content = '';
  message.deletedAt = new Date();
  message.attachment = null;
  await message.save();
  req.app.get('io').to(`conversation:${message.conversationId}`).emit('message:deleted', { messageId: message.id, conversationId: message.conversationId });
  res.json({ success: true });
}));
router.post('/messages/:id/read', authRequired, asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message || !(await membership(message.conversationId, req.user.id))) return res.status(404).json({ error: 'Message not found.' });
  await Message.updateMany({ conversationId: message.conversationId, senderId: { $ne: req.user.id }, 'readBy.userId': { $ne: req.user._id } }, { $addToSet: { readBy: { userId: req.user._id, readAt: new Date() } } });
  await Notification.updateMany({ userId: req.user.id, conversationId: message.conversationId, isRead: false }, { isRead: true });
  req.app.get('io').to(`conversation:${message.conversationId}`).emit('message:read', { conversationId: String(message.conversationId), userId: req.user.id, messageId: message.id });
  res.json({ success: true });
}));

router.get('/notifications', authRequired, asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(60).populate('senderId', 'username fullName avatar');
  res.json({ notifications });
}));
router.patch('/notifications/:id/read', authRequired, asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { isRead: true }, { new: true });
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ notification });
}));
router.patch('/notifications/read-all', authRequired, asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user.id, isRead: false }, { isRead: true });
  res.json({ success: true });
}));

router.get('/push/public-key', authRequired, (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Browser push is not configured on this server.' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});
router.post('/push/subscribe', authRequired, asyncHandler(async (req, res) => {
  const data = parse(z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string(), auth: z.string() }) }), req.body);
  await PushSubscription.findOneAndUpdate({ endpoint: data.endpoint }, { userId: req.user.id, keys: data.keys, userAgent: req.get('user-agent')?.slice(0, 300) }, { upsert: true, new: true });
  res.status(201).json({ success: true });
}));
router.delete('/push/subscribe', authRequired, asyncHandler(async (req, res) => {
  const endpoint = parse(z.string().url().max(2048), req.body.endpoint);
  await PushSubscription.deleteOne({ userId: req.user.id, endpoint });
  res.json({ success: true });
}));

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const upload = multer({
  dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, done) => done(null, allowedTypes.has(file.mimetype))
});
router.post('/uploads', authRequired, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a supported file under 10 MB.' });
  let data;
  try { data = parse(z.object({ conversationId: z.string().regex(/^[a-f\d]{24}$/i) }), req.body); }
  catch (error) {
    try { await unlink(req.file.path); } catch (cleanupError) { console.error('Unable to remove rejected upload:', cleanupError.message); }
    throw error;
  }
  if (!(await membership(data.conversationId, req.user.id))) {
    try { await unlink(req.file.path); } catch (error) { console.error('Unable to remove unauthorized upload:', error.message); }
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  let attachment;
  try {
    attachment = await Attachment.create({ ownerId: req.user.id, conversationId: data.conversationId, originalName: path.basename(req.file.originalname).slice(0, 180), storedName: req.file.filename, mimeType: req.file.mimetype, size: req.file.size });
  } catch (error) {
    try { await unlink(req.file.path); } catch (cleanupError) { console.error('Unable to remove failed upload:', cleanupError.message); }
    throw error;
  }
  res.status(201).json({ attachment: { id: attachment.id, originalName: attachment.originalName, mimeType: attachment.mimeType, size: attachment.size } });
}));
router.get('/uploads/:id', authRequired, asyncHandler(async (req, res) => {
  const attachment = await Attachment.findById(req.params.id);
  if (!attachment || !(await membership(attachment.conversationId, req.user.id))) return res.status(404).json({ error: 'File not found.' });
  if (req.query.inline === '1' && attachment.mimeType.startsWith('image/')) {
    res.type(attachment.mimeType);
    return res.sendFile(path.join(uploadDir, attachment.storedName));
  }
  res.download(path.join(uploadDir, attachment.storedName), attachment.originalName);
}));

router.get('/admin/users', authRequired, adminRequired, asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50);
  res.json({ users: users.map(user => ({ ...userView(user), isActive: user.isActive })), page });
}));
router.patch('/admin/users/:id/status', authRequired, adminRequired, asyncHandler(async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  if (req.params.id === req.user.id && !isActive) return res.status(400).json({ error: 'You cannot disable your own account.' });
  const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!isActive) {
    await UserSession.deleteMany({ userId: user.id });
    req.app.get('io').in(`user:${user.id}`).disconnectSockets(true);
  }
  res.json({ user: { ...userView(user), isActive: user.isActive } });
}));
router.get('/admin/statistics', authRequired, adminRequired, asyncHandler(async (req, res) => {
  const [users, conversations, messages, activeUsers] = await Promise.all([User.countDocuments(), Conversation.countDocuments(), Message.countDocuments(), User.countDocuments({ isActive: true })]);
  res.json({ statistics: { users, activeUsers, conversations, messages } });
}));
router.get('/admin/messages', authRequired, adminRequired, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.json({ messages: [] });
  const messages = await Message.find({ content: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }, deletedAt: null })
    .sort({ createdAt: -1 }).limit(50).populate('senderId', 'username fullName').populate('conversationId', 'type groupInfo.name');
  res.json({ messages });
}));
router.delete('/admin/messages/:id', authRequired, adminRequired, asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  message.content = '';
  message.attachment = null;
  message.deletedAt = new Date();
  await message.save();
  req.app.get('io').to(`conversation:${message.conversationId}`).emit('message:deleted', { messageId: message.id, conversationId: message.conversationId });
  res.json({ success: true });
}));

export default router;
