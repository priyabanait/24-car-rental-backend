import mongoose from 'mongoose';

const DriverWalletMessageSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.DriverWalletMessage || mongoose.model('DriverWalletMessage', DriverWalletMessageSchema);
