import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  type: { type: String, default: 'message' },
  title: { type: String, maxlength: 120 },
  body: { type: String, maxlength: 240 },
  isRead: { type: Boolean, default: false }
}, { timestamps: { createdAt: true, updatedAt: false } });

notificationSchema.index({ userId: 1, createdAt: -1 });
export default mongoose.model('Notification', notificationSchema);
