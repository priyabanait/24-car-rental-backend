import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  id: Number,
  type: String,
  amount: Number,
  status: String,
  date: String,
  description: String,
  driverId: Number,
  vehicleId: Number,
  investorId: Number
}, { timestamps: true, strict: false });

export default mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
