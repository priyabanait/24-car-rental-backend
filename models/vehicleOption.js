import mongoose from 'mongoose';

const VehicleOptionSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['category', 'brand', 'model', 'carName'] },
  value: { type: String, required: true },
  valueLower: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

VehicleOptionSchema.pre('validate', function(next) {
  if (this.value) this.valueLower = this.value.trim().toLowerCase();
  next();
});

VehicleOptionSchema.index({ type: 1, valueLower: 1 }, { unique: true });

export default mongoose.models.VehicleOption || mongoose.model('VehicleOption', VehicleOptionSchema);
