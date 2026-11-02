import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: String, auth: String },
  userAgent: { type: String, maxlength: 300 }
}, { timestamps: { createdAt: true, updatedAt: false } });
export default mongoose.model('PushSubscription', schema);
