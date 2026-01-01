import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  type: { type: String },
  title: { type: String },
  message: { type: String },
  payload: { type: mongoose.Schema.Types.Mixed },
  read: { type: Boolean, default: false },
  // Admin notification fields
  userId: { type: mongoose.Schema.Types.ObjectId, index: true }, // Driver or Investor ID
  userType: { type: String, enum: ['driver', 'investor', 'customer'], index: true }, // Type of user
  scheduledFor: { type: Date }, // For scheduled notifications
  isScheduled: { type: Boolean, default: false } // Flag for scheduled notifications
}, { timestamps: true });

// Index for efficient queries
NotificationSchema.index({ userId: 1, userType: 1 });
NotificationSchema.index({ isScheduled: 1, scheduledFor: 1 });

export default mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
