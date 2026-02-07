import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  // Driver/User Information
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DriverSignup',
    required: true
  },
  driverName: {
    type: String,
    required: true
  },
  driverMobile: {
    type: String,
    required: true
  },
  driverEmail: {
    type: String
  },

  // Vehicle Information
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  vehicleName: {
    type: String,
    required: true
  },
  vehicleModel: {
    type: String
  },
  vehicleNumber: {
    type: String
  },

  // Booking Details
  city: {
    type: String,
    required: true
  },
  pickupLocation: {
    type: String,
    required: true
  },
  dropoffLocation: {
    type: String
  },
  tripStartDate: {
    type: Date,
    required: true
  },
  tripStartTime: {
    type: String,
    default: null
  },
  tripEndDate: {
    type: Date
  },
  tripEndTime: {
    type: String,
    default: null
  },
  numberOfDays: {
    type: Number,
    default: 1
  },

  // Pricing
  pricePerDay: {
    type: Number,
    required: true
  },
  pricePerHour: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  securityDeposit: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    required: true
  },

  // Payment Information
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'completed', 'refunded', 'failed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'netbanking', 'wallet'],
    default: 'cash'
  },
  // Rent tracking fields
  rentStartDate: {
    type: Date,
    default: null
  },
  rentPausedDate: {
    type: Date,
    default: null
  },
  transactionId: {
    type: String
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  extraAmount: {
    type: Number,
    default: 0
  },
  extraReason: {
    type: String,
    default: ''
  },
  extraAmounts: [{
    amount: { type: Number, required: true },
    reason: { type: String, default: '' },
    date: { type: Date, default: Date.now }
  }],
  adjustmentAmount: {
    type: Number,
    default: 0
  },
  adjustmentReason: {
    type: String,
    default: ''
  },
  adjustments: [{
    amount: { type: Number, required: true },
    reason: { type: String, default: '' },
    date: { type: Date, default: Date.now }
  }],

  // Booking Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled', 'rejected'],
    default: 'pending'
  },
  bookingType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'subscription', 'hourly'],
    default: 'daily'
  },

  // Additional Options
  withDriver: {
    type: Boolean,
    default: false
  },
  deliveryRequired: {
    type: Boolean,
    default: false
  },
  deliveryAddress: {
    type: String
  },

  // Documents & Verification
  licenseVerified: {
    type: Boolean,
    default: false
  },
  aadharVerified: {
    type: Boolean,
    default: false
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },

  // Cancellation
  cancellationReason: {
    type: String
  },
  cancelledBy: {
    type: String,
    enum: ['driver', 'admin', 'system']
  },
  cancelledAt: {
    type: Date
  },
  refundAmount: {
    type: Number,
    default: 0
  },

  // Notes
  notes: {
    type: String
  },
  adminNotes: {
    type: String
  },

  // Ratings & Reviews
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  review: {
    type: String
  },
  reviewedAt: {
    type: Date
  }

}, { timestamps: true });

// Indexes for faster queries
bookingSchema.index({ driverId: 1, status: 1 });
bookingSchema.index({ vehicleId: 1, status: 1 });
bookingSchema.index({ tripStartDate: 1, tripEndDate: 1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ status: 1 });

// Ensure a driver can have at most one active booking at a time (DB-level enforcement)
// Partial unique index: only applies when status is pending|confirmed|ongoing
bookingSchema.index(
  { driverId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'confirmed', 'ongoing'] } }
  }
);

// Virtual for booking duration
bookingSchema.virtual('duration').get(function() {
  if (this.tripEndDate && this.tripStartDate) {
    const diffTime = Math.abs(this.tripEndDate - this.tripStartDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
  return 1;
});

// Method to calculate total amount
bookingSchema.methods.calculateTotal = function() {
  const days = this.numberOfDays || 1;
  this.totalAmount = this.pricePerDay * days;
  this.finalAmount = this.totalAmount - this.discount + this.securityDeposit;
  return this.finalAmount;
};

// Method to check if booking is active
bookingSchema.methods.isActive = function() {
  return ['confirmed', 'ongoing'].includes(this.status);
};

export default mongoose.model('Booking', bookingSchema);
