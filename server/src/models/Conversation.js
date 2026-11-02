import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['private', 'group'], required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  privateKey: { type: String, unique: true, sparse: true, index: true },
  groupInfo: {
    name: { type: String, maxlength: 80 },
    description: { type: String, maxlength: 300, default: '' },
    avatar: { type: String, default: '' },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null }
}, { timestamps: true });

conversationSchema.index({ participants: 1, updatedAt: -1 });
export default mongoose.model('Conversation', conversationSchema);
