import jwt from 'jsonwebtoken';
import UserSession from '../models/UserSession.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createHash } from 'node:crypto';

export const authRequired = asyncHandler(async (req, res, next) => {
  const token = req.cookies.GoodBros;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const session = await UserSession.findOne({ _id: payload.sid, userId: payload.sub, tokenHash, expiresAt: { $gt: new Date() } });
  if (!session) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  const user = await User.findOne({ _id: payload.sub, isActive: true });
  if (!user) return res.status(401).json({ error: 'This account is unavailable.' });
  req.user = user;
  req.session = session;
  next();
});

export const adminRequired = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
  next();
};
