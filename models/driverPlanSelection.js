import mongoose from 'mongoose';

const DriverPlanSelectionSchema = new mongoose.Schema({
  vehicleId: {
    type: Number,
    required: false,
    ref: 'Vehicle'
  },
  driverSignupId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DriverSignup', 
    required: true 
  },
  driverUsername: { type: String },
  driverMobile: { type: String, required: true },
  planName: { type: String, required: true },
  planType: { 
    type: String, 
    required: true, 
    enum: ['weekly', 'daily'] 
  },
  securityDeposit: { type: Number, default: 0 },
  rentSlabs: { type: Array, default: [] },
  selectedRentSlab: { type: Object, default: null },
  selectedDate: { type: Date, default: Date.now },
  status: { 
    type: String, 
    default: 'active', 
    enum: ['active', 'inactive', 'completed', 'cancelled'] 
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  paymentDate: {
    type: Date,
    default: null
  },
  paymentMode: {
    type: String,
    enum: ['online', 'cash'],
    required: false
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque', 'Online', 'UPI'],
    default: 'Cash'
  },
  // Manual payment amount entered by driver (can differ from calculated total)
  paidAmount: { type: Number, default: null },
  // Payment type: 'rent' or 'security'
  paymentType: { type: String, enum: ['rent', 'security'], default: 'rent' },
  // Rent calculation start date (set on payment confirmation)
  rentStartDate: {
    type: Date,
    default: null
  },
  // Convenience field for daily rent amount locked at selection time
  rentPerDay: { type: Number, default: 0 },
  // Calculated payment breakdown stored at creation/update
  calculatedDeposit: { type: Number, default: 0 },
  calculatedRent: { type: Number, default: 0 },
  calculatedCover: { type: Number, default: 0 },
  calculatedTotal: { type: Number, default: 0 },
  extraAmount: { type: Number, default: 0 },
  extraReason: { type: String, default: '' },
  adjustmentAmount: { type: Number, default: 0 }
}, { timestamps: true });

// Index for faster queries
DriverPlanSelectionSchema.index({ driverSignupId: 1 });
DriverPlanSelectionSchema.index({ driverMobile: 1 });

export default mongoose.models.DriverPlanSelection || mongoose.model('DriverPlanSelection', DriverPlanSelectionSchema);
