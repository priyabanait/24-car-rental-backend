import mongoose from 'mongoose';

const DriverPlanSchema = new mongoose.Schema({
  id: Number,
  name: String,
  type: String,
  amount: Number,
  description: String,
  features: [String],
  status: String,
  driversCount: Number,
  createdDate: String
}, { timestamps: true });

export default mongoose.models.DriverPlan || mongoose.model('DriverPlan', DriverPlanSchema);
