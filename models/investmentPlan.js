import mongoose from 'mongoose';

const InvestmentPlanSchema = new mongoose.Schema({
  id: Number,
  name: String,
  minAmount: Number,
  maxAmount: Number,
  returnRate: Number,
  duration: Number,
  description: String,
  features: [String],
  status: String,
  investorsCount: Number,
  totalInvested: Number
}, { timestamps: true });

export default mongoose.models.InvestmentPlan || mongoose.model('InvestmentPlan', InvestmentPlanSchema);
