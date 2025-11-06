import mongoose from 'mongoose';

const DriverSchema = new mongoose.Schema({
  id: Number,
  name: String,
  email: String,
  phone: String,
  licenseNumber: String,
  status: String,
  joinDate: String,
  vehicleAssigned: String,
  totalEarnings: Number,
  kycStatus: String,
  rating: Number,
  totalTrips: Number,
  currentPlan: String,
  planAmount: Number,
  address: String,
  emergencyContact: String,
  documents: Object
}, { timestamps: true, strict: false });

export default mongoose.models.Driver || mongoose.model('Driver', DriverSchema);
