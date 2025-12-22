import mongoose from 'mongoose';
import Vehicle from '../models/vehicle.js';
import CarInvestmentEntry from '../models/carInvestmentEntry.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/24carrental';

async function updateMonthlyProfitMin() {
  await mongoose.connect(MONGO_URI);
  const vehicles = await Vehicle.find({});
  let updated = 0;
  for (const v of vehicles) {
    const category = (v.category || v.carCategory || '').toLowerCase();
    const matchedInvestment = await CarInvestmentEntry.findOne({ name: new RegExp(`^${category}$`, 'i') });
    if (matchedInvestment) {
      const minAmount = parseFloat(matchedInvestment.minAmount || 0);
      const expectedROI = parseFloat(matchedInvestment.expectedROI || 0);
      const monthlyProfitMin = minAmount * (expectedROI / 100) / 12;
      v.monthlyProfitMin = monthlyProfitMin;
      await v.save();
      updated++;
    }
  }
  console.log(`Updated ${updated} vehicles.`);
  await mongoose.disconnect();
}

updateMonthlyProfitMin().catch(console.error);
