import mongoose from 'mongoose';

const TicketSchema = new mongoose.Schema({
  id: Number,
  title: String,
  description: String,
  status: String,
  priority: String,
  category: String,
  submittedBy: String,
  submittedDate: String,
  assignedTo: String,
  driverId: Number,
  vehicleId: Number
}, { timestamps: true });

export default mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);
