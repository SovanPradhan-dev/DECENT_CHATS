import mongoose from 'mongoose';

const pollVoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  optionIndex: { type: Number, required: true },
  votedAt: { type: Date, default: Date.now }
}, { _id: false });

const pollSchema = new mongoose.Schema({
  question: { type: String, required: true, maxlength: 180 },
  options: [{ type: String, maxlength: 80 }],
  votes: { type: [pollVoteSchema], default: [] },
  closedAt: { type: Date, default: null }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientMessageId: { type: String, required: true },
  content: { type: String, maxlength: 4000, default: '' },
  messageType: { type: String, enum: ['text', 'file', 'poll'], default: 'text' },
  attachment: { type: mongoose.Schema.Types.ObjectId, ref: 'Attachment', default: null },
  poll: { type: pollSchema, default: null },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  readBy: [{ userId: mongoose.Schema.Types.ObjectId, readAt: { type: Date, default: Date.now } }],
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, senderId: 1, clientMessageId: 1 }, { unique: true });
export default mongoose.model('Message', messageSchema);
