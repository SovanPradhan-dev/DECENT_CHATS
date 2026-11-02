import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDatabase } from './config/db.js';
import User from './models/User.js';
import { readPassword } from './utils/readPassword.js';

const [email, username, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(' ');
if (!email || !username || !fullName) {
  console.error('Usage: npm run admin:create -w server -- <email> <username> <full name>');
  process.exit(1);
}
const password = await readPassword('Administrator password (12+ characters): ');
if (password.length < 12) throw new Error('Use a password of at least 12 characters.');
await connectDatabase(process.env.MONGODB_URI);
const normalizedEmail = email.toLowerCase();
const normalizedUsername = username.toLowerCase();
const existing = await User.findOne({ $or: [{ normalizedEmail }, { normalizedUsername }] });
if (existing) throw new Error('An account already uses that email or username.');
await User.create({ email, normalizedEmail, username, normalizedUsername, fullName, passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
console.log(`Administrator ${username} created.`);
process.exit(0);
