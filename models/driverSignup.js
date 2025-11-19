import mongoose from 'mongoose';
import crypto from 'crypto';

const DriverSignupSchema = new mongoose.Schema({
  driverToken: { type: String, unique: true, required: true },
  username: { type: String, unique: true, sparse: true },
  mobile: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'active', 'inactive', 'suspended'] },
  kycStatus: { type: String, default: 'pending', enum: ['pending', 'verified', 'rejected', 'incomplete'] },
  signupDate: { type: Date, default: Date.now },
  isVerified: { type: Boolean, default: false }
}, { timestamps: true });

// Generate unique driver token before saving
DriverSignupSchema.pre('save', function(next) {
  if (!this.driverToken) {
    this.driverToken = 'DRV' + crypto.randomBytes(8).toString('hex').toUpperCase();
  }
  next();
});

export default mongoose.models.DriverSignup || mongoose.model('DriverSignup', DriverSignupSchema);
