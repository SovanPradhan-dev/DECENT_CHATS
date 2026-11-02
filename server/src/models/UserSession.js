import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  deviceName: { type: String, maxlength: 160, default: 'Browser' },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: { createdAt: true, updatedAt: false } });
export default mongoose.model('UserSession', schema);
