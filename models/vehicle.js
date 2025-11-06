import mongoose from 'mongoose';

// Counter schema for auto-incrementing vehicleId
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

// Function to get the next sequence value
async function getNextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

const VehicleSchema = new mongoose.Schema({
  vehicleId: {
    type: Number,
    unique: true,
    required: true
  },
  registrationNumber: {
    type: String,
    trim: true,
    required: true,
    unique: true
  },
  model: String,
  ownerName: String,
  ownerPhone: String,
  year: Number,
  registrationDate: String,
  roadTaxDate: String,
  insuranceDate: String,
  permitDate: String,
  emissionDate: String,
  trafficFine: Number,
  trafficFineDate: String,
  fuelType: String,
  assignedDriver: String,
  kycStatus: {
    type: String,
    enum: ['verified', 'pending', 'rejected', 'incomplete'],
    default: 'pending'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'suspended'],
    default: 'inactive'
  },
  remarks: String,
  
  // Documents
  insuranceDoc: String,
  rcDoc: String,
  permitDoc: String,
  pollutionDoc: String,
  fitnessDoc: String,
  
  // Additional fields
  make: String,
  color: String,
  purchaseDate: String,
  purchasePrice: Number,
  currentValue: Number,
  mileage: Number,
  lastService: String,
  nextService: String
}, { 
  timestamps: true,
  strict: false // Allow additional fields
});

// Add getNextSequence as a static method
VehicleSchema.statics.getNextSequence = getNextSequence;

const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', VehicleSchema);
export default Vehicle;
