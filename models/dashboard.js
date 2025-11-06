import mongoose from 'mongoose';

const DashboardSchema = new mongoose.Schema({
  totalDrivers: Number,
  activeDrivers: Number,
  totalVehicles: Number,
  availableVehicles: Number,
  totalInvestors: Number,
  totalInvestment: Number,
  monthlyRevenue: Number,
  monthlyExpenses: Number,
  profit: Number,
  openTickets: Number,
  pendingKyc: Number,
  maintenanceDue: Number
}, { timestamps: true });

export default mongoose.models.Dashboard || mongoose.model('Dashboard', DashboardSchema);
