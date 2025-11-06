import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  id: Number,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  role: String
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
