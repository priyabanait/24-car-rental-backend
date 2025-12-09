import express from 'express';
import Vehicle from '../models/vehicle.js';
import mongoose from 'mongoose';

const router = express.Router();

// GET /api/vehicles-by-investor - Group vehicles by investor with calculations
router.get('/', async (req, res) => {
  try {
    // Fetch all vehicles and populate investor details
    const vehicles = await Vehicle.find({})
      .populate('investorId', 'investorName phone email')
      .lean();

    // Group vehicles by investor
    const investorMap = {};

    vehicles.forEach(vehicle => {
      // Extract investor ID
      let investorId = null;
      let investorData = null;

      if (vehicle.investorId) {
        if (typeof vehicle.investorId === 'object') {
          investorId = vehicle.investorId._id?.toString() || vehicle.investorId.toString();
          investorData = vehicle.investorId;
        } else {
          investorId = vehicle.investorId.toString();
        }
      }

      // Skip vehicles without investor
      if (!investorId) return;

      // Initialize investor entry if not exists
      if (!investorMap[investorId]) {
        investorMap[investorId] = {
          investorId: investorId,
          investorName: investorData?.investorName || 'Unknown',
          investorPhone: investorData?.phone || '',
          investorEmail: investorData?.email || '',
          totalVehicles: 0,
          totalMonthlyPayout: 0,
          totalCumulativePayout: 0,
          vehicles: []
        };
      }

      // Calculate months from rentPeriods
      let calculatedMonths = 0;
      const status = vehicle.status || 'inactive';
      
      if (Array.isArray(vehicle.rentPeriods) && vehicle.rentPeriods.length > 0 && status === 'active') {
        vehicle.rentPeriods.forEach(period => {
          const start = new Date(period.start);
          const end = period.end ? new Date(period.end) : new Date();
          const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
          calculatedMonths += Math.floor(diffDays / 30) + 1;
        });
      }

      // Calculate cumulative payout
      const monthlyPayout = vehicle.monthlyProfitMin || 0;
      const cumulativePayout = monthlyPayout * calculatedMonths;

      // Prepare vehicle data with calculations
      const vehicleData = {
        _id: vehicle._id,
        vehicleId: vehicle.vehicleId || vehicle._id,
        registrationNumber: vehicle.registrationNumber,
        brand: vehicle.brand,
        model: vehicle.model,
        category: vehicle.category,
        status: status,
        ownerName: vehicle.ownerName,
        monthlyProfitMin: monthlyPayout,
        calculatedMonths: calculatedMonths,
        cumulativePayout: cumulativePayout,
        isActive: status === 'active',
        hasRentPeriods: Array.isArray(vehicle.rentPeriods) && vehicle.rentPeriods.length > 0,
        rentPeriods: vehicle.rentPeriods || []
      };

      // Add to investor's vehicles
      investorMap[investorId].vehicles.push(vehicleData);
      investorMap[investorId].totalVehicles += 1;
      investorMap[investorId].totalMonthlyPayout += monthlyPayout;
      investorMap[investorId].totalCumulativePayout += cumulativePayout;
    });

    // Convert map to array
    const result = Object.values(investorMap).map(investor => ({
      ...investor,
      // Sort vehicles by registration number
      vehicles: investor.vehicles.sort((a, b) => 
        (a.registrationNumber || '').localeCompare(b.registrationNumber || '')
      )
    }));

    // Sort by investor name
    result.sort((a, b) => a.investorName.localeCompare(b.investorName));

    res.json(result);
  } catch (err) {
    console.error('Error fetching vehicles by investor:', err);
    res.status(500).json({ error: 'Failed to fetch vehicles by investor' });
  }
});

// GET /api/vehicles-by-investor/:investorId - Get all vehicles for a specific investor
router.get('/:investorId', async (req, res) => {
  try {
    const { investorId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(investorId)) {
      return res.status(400).json({ error: 'Invalid investor ID' });
    }

    // Fetch vehicles for this investor
    const vehicles = await Vehicle.find({ investorId: investorId })
      .populate('investorId', 'investorName phone email')
      .lean();

    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'No vehicles found for this investor' });
    }

    // Get investor data from first vehicle
    const investorData = vehicles[0].investorId;
    
    let totalMonthlyPayout = 0;
    let totalCumulativePayout = 0;

    // Calculate for each vehicle
    const vehiclesWithCalculations = vehicles.map(vehicle => {
      // Calculate months from rentPeriods
      let calculatedMonths = 0;
      const status = vehicle.status || 'inactive';
      
      if (Array.isArray(vehicle.rentPeriods) && vehicle.rentPeriods.length > 0 && status === 'active') {
        vehicle.rentPeriods.forEach(period => {
          const start = new Date(period.start);
          const end = period.end ? new Date(period.end) : new Date();
          const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
          calculatedMonths += Math.floor(diffDays / 30) + 1;
        });
      }

      // Calculate cumulative payout
      const monthlyPayout = vehicle.monthlyProfitMin || 0;
      const cumulativePayout = monthlyPayout * calculatedMonths;

      totalMonthlyPayout += monthlyPayout;
      totalCumulativePayout += cumulativePayout;

      return {
        _id: vehicle._id,
        vehicleId: vehicle.vehicleId || vehicle._id,
        registrationNumber: vehicle.registrationNumber,
        brand: vehicle.brand,
        model: vehicle.model,
        category: vehicle.category,
        status: status,
        ownerName: vehicle.ownerName,
        monthlyProfitMin: monthlyPayout,
        calculatedMonths: calculatedMonths,
        cumulativePayout: cumulativePayout,
        isActive: status === 'active',
        hasRentPeriods: Array.isArray(vehicle.rentPeriods) && vehicle.rentPeriods.length > 0,
        rentPeriods: vehicle.rentPeriods || []
      };
    });

    const result = {
      investorId: investorId,
      investorName: investorData?.investorName || 'Unknown',
      investorPhone: investorData?.phone || '',
      investorEmail: investorData?.email || '',
      totalVehicles: vehicles.length,
      totalMonthlyPayout: totalMonthlyPayout,
      totalCumulativePayout: totalCumulativePayout,
      vehicles: vehiclesWithCalculations.sort((a, b) => 
        (a.registrationNumber || '').localeCompare(b.registrationNumber || '')
      )
    };

    res.json(result);
  } catch (err) {
    console.error('Error fetching vehicles for investor:', err);
    res.status(500).json({ error: 'Failed to fetch vehicles for investor' });
  }
});

export default router;
