import mongoose from 'mongoose';

const DriverPaymentSchema = new mongoose.Schema({
  driverId: { type: String, required: false },
  driverName: { type: String, required: false },
  phone: { type: String, required: false },
  paymentType: { type: String, required: false }, // e.g., weekly_earnings, bonus, booking_cancellation
  period: { type: String, required: false },
  amount: { type: Number, default: 0 },
  commissionAmount: { type: Number, default: 0 },
  commissionRate: { type: Number, default: 0 },
  netPayment: { type: Number, default: 0 },
  totalTrips: { type: Number, default: 0 },
  totalDistance: { type: Number, default: 0 },
  status: { type: String, default: 'pending' },
  paymentMethod: { type: String, required: false },
  transactionId: { type: String, required: false },
  paymentDate: { type: Date, default: Date.now },
  bankDetails: { type: Object, required: false },
  bookingId: { type: mongoose.Schema.Types.ObjectId, required: false },
  id: { type: Number, required: false, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

DriverPaymentSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.DriverPayment || mongoose.model('DriverPayment', DriverPaymentSchema);