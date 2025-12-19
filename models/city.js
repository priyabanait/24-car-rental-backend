import mongoose from 'mongoose';

const CitySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true 
  },
  state: { 
    type: String, 
    required: true,
    trim: true 
  },
  country: { 
    type: String, 
    default: 'India',
    trim: true 
  },
  addresses: [{
    address: {
      type: String,
      trim: true,
      required: true
    },
    label: {
      type: String,
      trim: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  vehicleCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Index for faster searches
CitySchema.index({ name: 1, state: 1 });
CitySchema.index({ isActive: 1 });

export default mongoose.models.City || mongoose.model('City', CitySchema);
