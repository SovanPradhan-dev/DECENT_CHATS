import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 24 },
  normalizedUsername: { type: String, required: true, unique: true, index: true },
  fullName: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, index: true, lowercase: true },
  normalizedEmail: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, default: '' },
  bio: { type: String, maxlength: 240, default: '' },
  isActive: { type: Boolean, default: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  preferences: {
    theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
    desktopNotifications: { type: Boolean, default: false },
    pushNotifications: { type: Boolean, default: false },
    notificationSound: { type: Boolean, default: true },
    mutedConversations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }]
  },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

userSchema.index({ fullName: 'text', username: 'text' });
export default mongoose.model('User', userSchema);
