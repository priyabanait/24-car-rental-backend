import mongoose from 'mongoose';

const InvestorSchema = new mongoose.Schema({
  id: Number,
  name: String,
  email: String,
  phone: String,
  panNumber: String,
  status: String,
  joinDate: String,
  totalInvestment: Number,
  currentReturns: Number,
  expectedReturns: Number,
  investmentPlan: String,
  maturityDate: String,
  kycStatus: String,
  bankAccount: String,
  address: String
}, { timestamps: true });

export default mongoose.models.Investor || mongoose.model('Investor', InvestorSchema);
