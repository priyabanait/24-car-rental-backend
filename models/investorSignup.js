import mongoose from 'mongoose';
import crypto from 'crypto';

const InvestorSignupSchema = new mongoose.Schema({
  investorToken: { type: String, unique: true, required: true },
  investorName: { type: String, required: true },
  email: { type: String, required: false },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'active', 'inactive'] },
  kycStatus: { type: String, default: 'pending', enum: ['pending', 'verified', 'rejected'] },
  signupDate: { type: Date, default: Date.now },
  isVerified: { type: Boolean, default: false }
}, { timestamps: true });

// Generate unique investor token before saving
InvestorSignupSchema.pre('save', function(next) {
  if (!this.investorToken) {
    this.investorToken = 'INV' + crypto.randomBytes(8).toString('hex').toUpperCase();
  }
  next();
});

export default mongoose.models.InvestorSignup || mongoose.model('InvestorSignup', InvestorSignupSchema);
