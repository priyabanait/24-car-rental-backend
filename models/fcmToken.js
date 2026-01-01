import mongoose from 'mongoose';

const FcmTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, index: true },
  userType: { type: String, enum: ['driver', 'investor', 'customer'], index: true },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.FcmToken || mongoose.model('FcmToken', FcmTokenSchema);