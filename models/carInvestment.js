import mongoose from 'mongoose';

const InvestmentPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },

  expectedROI: { type: Number, required: true },

  features: [String],
  active: { type: Boolean, default: true },
  // Additional fields for compatibility
  returnRate: Number,
  description: String,
  status: String,
  investorsCount: Number,
  totalInvested: Number
}, { timestamps: true });

export default mongoose.models.InvestmentPlan || mongoose.model('InvestmentPlan', InvestmentPlanSchema);
