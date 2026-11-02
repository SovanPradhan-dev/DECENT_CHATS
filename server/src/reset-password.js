import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDatabase } from './config/db.js';
import User from './models/User.js';
import UserSession from './models/UserSession.js';
import { readPassword } from './utils/readPassword.js';

const [email] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run account:reset -w server -- <email>');
  process.exit(1);
}
const password = await readPassword('New password (12+ characters): ');
const confirmation = await readPassword('Confirm new password: ');
if (password.length < 12) throw new Error('Use a password of at least 12 characters.');
if (password !== confirmation) throw new Error('Passwords do not match.');
await connectDatabase(process.env.MONGODB_URI);
const user = await User.findOne({ normalizedEmail: email.toLowerCase() });
if (!user) throw new Error('No account was found with that email address.');
user.passwordHash = await bcrypt.hash(password, 12);
await user.save();
await UserSession.deleteMany({ userId: user.id });
console.log(`Password reset for ${user.username}; all sessions have been signed out.`);
process.exit(0);
