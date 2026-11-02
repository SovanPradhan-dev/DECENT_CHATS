import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientMessageId: { type: String, required: true },
  content: { type: String, maxlength: 4000, default: '' },
  messageType: { type: String, enum: ['text', 'file'], default: 'text' },
  attachment: { type: mongoose.Schema.Types.ObjectId, ref: 'Attachment', default: null },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  readBy: [{ userId: mongoose.Schema.Types.ObjectId, readAt: { type: Date, default: Date.now } }],
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, senderId: 1, clientMessageId: 1 }, { unique: true });
export default mongoose.model('Message', messageSchema);
