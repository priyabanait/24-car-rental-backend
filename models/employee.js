import mongoose from 'mongoose';

const EmployeeSchema = new mongoose.Schema({
  id: Number,
  name: String,
  email: String,
  phone: String,
  designation: String,
  department: String,
  joinDate: String,
  salary: Number,
  status: String,
  reportingManager: String,
  address: String
}, { timestamps: true });

export default mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);
