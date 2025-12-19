import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  id: Number,
  email: { type: String, required: true, unique: true },
  mobile: { type: String, sparse: true, unique: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, default: 'customer' }
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
