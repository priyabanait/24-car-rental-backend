import mongoose from 'mongoose';

const CarInvestmentEntrySchema = new mongoose.Schema({
  name: { type: String, required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  expectedROI: { type: Number, required: true },
  features: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  status: { type: String, default: 'pending' },

}, { timestamps: true });

export default mongoose.models.CarInvestmentEntry || mongoose.model('CarInvestmentEntry', CarInvestmentEntrySchema);
