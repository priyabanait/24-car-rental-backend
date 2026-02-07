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
  investorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investor',
    required: false
  },
  registrationNumber: {
    type: String,
    trim: true,
    required: true,
    unique: true
  },
  // Core details
  model: String,
  brand: String,
  category: String,
  vehicleType: {
    type: String,
    enum: ['bike', 'car', 'scooty'],
    index: true,
    required: false
  },
  carName: String,
  ownerName: String,
  ownerPhone: String,
  year: Number,
  registrationDate: String,
  rcExpiryDate: String,
  roadTaxDate: String,
  roadTaxNumber: String,
  insuranceDate: String,
  permitDate: String,
  emissionDate: String,
  pucNumber: String,
  trafficFine: Number,
  trafficFineDate: String,
  fuelType: String,
  seatingCapacity: {
    type: Number,
    enum: [2, 4, 5, 7, 8],
    default: 5
  },
  pricePerDay: {
    type: Number,
    default: 0
  },
  pricePerHour: {
    type: Number,
    default: 0
  },
  securityDeposit: {
    type: Number,
    default: 0
  },
  city: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  assignedDriver: String,
  assignedManager: {
    type: String,
    default: ''
  },
  rentStartDate: Date,
  rentPausedDate: Date,
  kycStatus: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending'
  },
  kycActivatedDate: {
    type: Date
  },
  kycVerifiedDate: {
    type: Date
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

  // New photo URL fields (uploaded to Cloudinary)
  registrationCardPhoto: String,
  roadTaxPhoto: String,
  pucPhoto: String,
  permitPhoto: String,
  carFrontPhoto: String,
  carLeftPhoto: String,
  carRightPhoto: String,
  carBackPhoto: String,
  carFullPhoto: String,
  
  // Features
  features: {
    type: [String],
    default: []
  },
  
  // Additional fields
  make: String,
  color: String,
  purchaseDate: String,
  purchasePrice: Number,
  currentValue: Number,
  mileage: Number,
  lastService: String,
  nextService: String,

  // Dynamic rent slabs
  weeklyRentSlabs: [
    {
      trips: Number,
      rentDay: Number,
      weeklyRent: Number,
      accidentalCover: Number,
      acceptanceRate: Number
    }
  ],
  dailyRentSlabs: [
    {
      trips: Number,
      rentDay: Number,
      weeklyRent: Number,
      accidentalCover: Number,
      acceptanceRate: Number
    }
  ],
    monthlyProfitMin: {
      type: Number,
      default: 0
    }
}, { 
  timestamps: true,
  strict: false // Allow additional fields
});

// Add getNextSequence as a static method
VehicleSchema.statics.getNextSequence = getNextSequence;

const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', VehicleSchema);
export default Vehicle;
