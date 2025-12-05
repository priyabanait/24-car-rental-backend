import mongoose from 'mongoose';

const managerSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true },
  address: { type: String },
  city: { type: String },
  pincode: { type: String },
  salary: { type: Number },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  department: { type: String, default: 'Manager' },
  serviceCategory: { type: String },
  dob: { type: Date },
}, { timestamps: true });

const Manager = mongoose.model('Manager', managerSchema);
export default Manager;
