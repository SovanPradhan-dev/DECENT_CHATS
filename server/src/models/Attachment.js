import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  originalName: { type: String, required: true, maxlength: 180 },
  storedName: { type: String, required: true, unique: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true }
}, { timestamps: true });
export default mongoose.model('Attachment', schema);
