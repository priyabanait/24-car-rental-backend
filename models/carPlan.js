import mongoose from 'mongoose';

const CarPlanRowSchema = new mongoose.Schema({
  trips: String,
  rentDay: Number,
  weeklyRent: Number
}, { _id: false });

const CarPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // vehicleType is optional to accept flexible payloads from existing PlanModal
  vehicleType: { type: String },
  securityDeposit: { type: Number, default: 0 },
  rows: { type: [CarPlanRowSchema], default: [] },
  status: { type: String, default: 'active' },
  createdDate: String
}, { timestamps: true });

export default mongoose.models.CarPlan || mongoose.model('CarPlan', CarPlanSchema);
