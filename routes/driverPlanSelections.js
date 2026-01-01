
// ...existing code...

// PATCH: Update extraAmount and extraReason (Admin endpoint)

import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import DriverPlanSelection from '../models/driverPlanSelection.js';
import DriverSignup from '../models/driverSignup.js';
import Driver from '../models/driver.js';
import mongoose from 'mongoose';

function escapeRegex(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

dotenv.config();

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'dev_secret';

// Helper function to calculate payment details
// Now async: if rentStartDate is missing, check for an *active* vehicle assigned to this driver
// If such a vehicle exists, treat rent as started from today (without persisting) so that
// API responses show days when the vehicle is assigned + active.
async function calculatePaymentDetails(selection) {
  // Use only the persisted rentStartDate. Do NOT infer a start date from vehicle assignment
  // here — rent must be started explicitly by the vehicle update handler so that it is
  // persisted and there's no ambiguity about when counting began.
  let effectiveStart = selection.rentStartDate ? new Date(selection.rentStartDate) : null;
  let startInferred = false; // inference removed — kept for API compatibility

  // Calculate days (inclusive) using effectiveStart if present
  let days = 0;
  if (effectiveStart) {
    const start = effectiveStart;
    let end = new Date();
    if (selection.status === 'inactive' && selection.rentPausedDate) {
      end = new Date(selection.rentPausedDate);
    }
    // Normalize to midnight for both dates
    const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    days = Math.floor((endMidnight - startMidnight) / (1000 * 60 * 60 * 24)) + 1;
    days = Math.max(1, days);
  }

  // Rent per day/week
  const rentPerDay = selection.calculatedRent || (() => {
    const slab = selection.selectedRentSlab || {};
    return selection.planType === 'weekly' ? (slab.weeklyRent || 0) : (slab.rentDay || 0);
  })();

  // Accidental cover for weekly plans
  const accidentalCover = selection.planType === 'weekly' 
    ? (selection.calculatedCover || (selection.selectedRentSlab?.accidentalCover || 105)) 
    : 0;

  // Adjustment and paid amounts
  const adjustment = selection.adjustmentAmount || 0;
  const paidAmount = selection.paidAmount || 0;
  
  // Total amounts
  const totalDeposit = selection.securityDeposit || 0;
  const totalRent = days * rentPerDay;

  // Calculate how much has been paid towards each
  let depositDue = 0;
  let rentDue = 0;

  if (selection.paymentType === 'security') {
    depositDue = Math.max(0, totalDeposit - paidAmount);
    rentDue = Math.max(0, totalRent - adjustment);
  } else if (selection.paymentType === 'rent') {
    rentDue = Math.max(0, totalRent - paidAmount - adjustment);
    depositDue = totalDeposit;
  } else {
    depositDue = totalDeposit;
    rentDue = Math.max(0, totalRent - adjustment);
  }

  // Extra amount
  const extraAmount = selection.extraAmount || 0;

  // Total payable = deposit due + rent due (already adjusted) + accidental cover + extra
  const totalPayable = Math.max(0, depositDue + rentDue + accidentalCover + extraAmount);

  return {
    days,
    rentPerDay,
    totalRent,
    accidentalCover,
    depositDue,
    rentDue,
    extraAmount,
    adjustment,
    paidAmount,
    totalPayable,
    startInferred
  };
}

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid plan selection ID' });
    }
    const { extraAmount, extraReason, adjustmentAmount, adjustmentReason } = req.body;
    const selection = await DriverPlanSelection.findById(id);
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }
    
    // Handle extra amount - add to cumulative total and push to array
    if (typeof extraAmount !== 'undefined') {
      selection.extraAmount = (selection.extraAmount || 0) + extraAmount;
      if (!selection.extraAmounts) selection.extraAmounts = [];
      selection.extraAmounts.push({
        amount: extraAmount,
        reason: extraReason || '',
        date: new Date()
      });
      // Update the legacy reason field
      if (extraReason) {
        selection.extraReason = extraReason;
      }
    }
    
    // Handle adjustment amount - add to cumulative total and push to array
    if (typeof adjustmentAmount !== 'undefined') {
      const currentAdjustment = selection.adjustmentAmount || 0;
      selection.adjustmentAmount = currentAdjustment + adjustmentAmount;
      if (!selection.adjustments) selection.adjustments = [];
      selection.adjustments.push({
        amount: adjustmentAmount,
        reason: adjustmentReason || '',
        date: new Date()
      });
      // Update the legacy reason field
      if (adjustmentReason) {
        selection.adjustmentReason = adjustmentReason;
      }
    }
    
    await selection.save();
    res.json({ message: 'Extra/adjustment amount updated', selection });
  } catch (err) {
    console.error('PATCH /driver-plan-selections/:id error:', err);
    res.status(500).json({ message: 'Failed to update extra amount/reason' });
  }
});
// Get all driver payments for drivers managed by a specific manager
import Vehicle from '../models/vehicle.js';
router.get('/by-manager/:manager', async (req, res) => {
  try {
    const managerParam = req.params.manager?.trim();
    console.log('Get payments by manager - manager param:', managerParam);
    
    if (!managerParam) {
      return res.json([]);
    }

    // Build query for vehicles - manager can be ObjectId, email, name or username
    let managerIdentifiers = [managerParam];
    const Manager = (await import('../models/manager.js')).default;
    
    // If param looks like ObjectId, try to fetch manager by ID
    if (mongoose.Types.ObjectId.isValid(managerParam)) {
      const mgrDoc = await Manager.findById(managerParam).lean();
      if (mgrDoc) {
        console.log('Manager found by ID:', mgrDoc.name || mgrDoc.username);
        if (mgrDoc.name) managerIdentifiers.push(mgrDoc.name.trim());
        if (mgrDoc.username) managerIdentifiers.push(mgrDoc.username.trim());
        if (mgrDoc.email) managerIdentifiers.push(mgrDoc.email.trim());
      } else {
        console.log('Manager not found for ObjectId:', managerParam);
      }
    } 
    // If param looks like email, try to fetch manager by email
    else if (managerParam.includes('@')) {
      const mgrDoc = await Manager.findOne({ email: managerParam }).lean();
      if (mgrDoc) {
        console.log('Manager found by email:', mgrDoc.name || mgrDoc.username);
        if (mgrDoc._id) managerIdentifiers.push(mgrDoc._id.toString());
        if (mgrDoc.name) managerIdentifiers.push(mgrDoc.name.trim());
        if (mgrDoc.username) managerIdentifiers.push(mgrDoc.username.trim());
      } else {
        console.log('Manager not found for email:', managerParam);
      }
    }

    // Build query to match manager by ObjectId or name/username
    // Try multiple formats since assignedManager is a String field
    const vehicleQuery = {
      $or: [
        { assignedManager: managerParam }, // Direct ObjectId string match
        { assignedManager: managerParam.toString() }, // Ensure it's a string
        { assignedManager: { $in: managerIdentifiers.map(id => new RegExp(`^${id}$`, 'i')) } } // Name/username match
      ]
    };

    console.log('Vehicle query:', JSON.stringify(vehicleQuery, null, 2));
    console.log('Manager identifiers to search:', managerIdentifiers);

    // Find all vehicles assigned to this manager
    const vehicles = await Vehicle.find(vehicleQuery).lean();
    console.log(`Found ${vehicles.length} vehicles for manager`);
    
    // Debug: log sample vehicles to see their structure
    if (vehicles.length > 0) {
      console.log('Sample vehicle:', {
        vehicleId: vehicles[0].vehicleId,
        assignedManager: vehicles[0].assignedManager,
        assignedDriver: vehicles[0].assignedDriver,
        managerType: typeof vehicles[0].assignedManager,
        driverType: typeof vehicles[0].assignedDriver
      });
    }
    
    if (vehicles.length === 0) {
      console.log('No vehicles found for manager, returning empty array');
      // Try a simpler query to see if any vehicles exist with this manager in any format
      const allVehicles = await Vehicle.find({ assignedManager: { $exists: true, $ne: '' } }).limit(5).lean();
      console.log('Sample vehicles with managers:', allVehicles.map(v => ({
        vehicleId: v.vehicleId,
        assignedManager: v.assignedManager,
        managerType: typeof v.assignedManager
      })));
      return res.json([]);
    }

    // Collect all assigned driver IDs (could be ObjectId strings or usernames/mobiles)
    const assignedDriverIds = vehicles
      .map(v => v.assignedDriver)
      .filter(Boolean)
      .map(id => id.toString().trim());

    console.log('Assigned driver IDs from vehicles:', assignedDriverIds);
    console.log('Total vehicles with drivers:', assignedDriverIds.length, 'out of', vehicles.length);

    if (assignedDriverIds.length === 0) {
      console.log('No assigned drivers found in vehicles, returning empty array');
      return res.json([]);
    }

    // Convert valid ObjectIds to mongoose ObjectIds
    const validObjectIds = assignedDriverIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    console.log('Valid ObjectIds:', validObjectIds.length);

    // First, look up Driver documents (vehicles reference Driver collection)
    const drivers = validObjectIds.length > 0 
      ? await Driver.find({ _id: { $in: validObjectIds } }).lean()
      : [];

    console.log(`Found ${drivers.length} drivers from Driver collection`);

    // Extract mobile numbers and usernames from Driver documents
    const driverMobiles = drivers.map(d => d.mobile).filter(Boolean);
    const driverUsernames = drivers.map(d => d.username).filter(Boolean);
    const driverPhones = drivers.map(d => d.phone).filter(Boolean);
    
    console.log('Driver mobiles from Driver collection:', driverMobiles);
    console.log('Driver usernames from Driver collection:', driverUsernames);

    // Now look up DriverSignup documents by mobile/username (DriverSignup is used for payments)
    const driverSignupQuery = {
      $or: []
    };
    
    if (driverMobiles.length > 0) {
      driverSignupQuery.$or.push({ mobile: { $in: driverMobiles } });
    }
    if (driverUsernames.length > 0) {
      driverSignupQuery.$or.push({ username: { $in: driverUsernames } });
    }
    if (driverPhones.length > 0) {
      driverSignupQuery.$or.push({ phone: { $in: driverPhones } });
    }

    const driverSignups = driverSignupQuery.$or.length > 0
      ? await DriverSignup.find(driverSignupQuery).lean()
      : [];

    console.log(`Found ${driverSignups.length} driver signups matching Driver records`);

    // Collect all identifiers: ObjectIds, usernames, and mobiles
    const driverSignupIds = driverSignups.map(d => d._id);
    const signupUsernames = driverSignups.map(d => d.username).filter(Boolean);
    const signupMobiles = driverSignups.map(d => d.mobile).filter(Boolean);
    
    console.log('DriverSignup IDs:', driverSignupIds);
    console.log('DriverSignup usernames:', signupUsernames);
    console.log('DriverSignup mobiles:', signupMobiles);
    
    // Combine all identifiers for payment matching
    const allUsernames = [...new Set([...signupUsernames, ...driverUsernames, ...assignedDriverIds.filter(id => !mongoose.Types.ObjectId.isValid(id))])];
    const allMobiles = [...new Set([...signupMobiles, ...driverMobiles, ...driverPhones, ...assignedDriverIds.filter(id => !mongoose.Types.ObjectId.isValid(id))])];

    // Build query to find payments
    const paymentQuery = {
      $or: []
    };

    // Match by driverSignupId (most reliable)
    if (driverSignupIds.length > 0) {
      paymentQuery.$or.push({ driverSignupId: { $in: driverSignupIds } });
    }

    // Match by username (case-insensitive)
    if (allUsernames.length > 0) {
      paymentQuery.$or.push({ 
        driverUsername: { $in: allUsernames.map(u => new RegExp(`^${escapeRegex(String(u))}$`, 'i')) } 
      });
    }

    // Match by mobile
    if (allMobiles.length > 0) {
      paymentQuery.$or.push({ 
        driverMobile: { $in: allMobiles.map(m => new RegExp(`^${escapeRegex(String(m))}$`, 'i')) } 
      });
    }

    console.log('Payment query:', JSON.stringify(paymentQuery, null, 2));

    if (paymentQuery.$or.length === 0) {
      console.log('No payment query conditions, returning empty array');
      return res.json([]);
    }

    // Find all driver payments for these drivers
    const payments = await DriverPlanSelection.find(paymentQuery).lean();

    console.log(`Found ${payments.length} payments for manager`);
    
    // Add calculated payment details to each payment (calculate async so we can infer start from vehicle assignment)
    const paymentsWithDetails = await Promise.all(payments.map(async p => ({
      ...p,
      paymentDetails: await calculatePaymentDetails(p)
    })));

    res.json(paymentsWithDetails);
  } catch (err) {
    console.error('Get payments by manager error:', err);
    res.status(500).json({ message: 'Failed to load payments for manager', error: err.message });
  }
});
// Middleware to verify driver JWT token
const authenticateDriver = (req, res, next) => {
  // Allow DELETE requests without token
  if (req.method === 'DELETE') return next();
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Missing token' });
  }

  jwt.verify(token, SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.driver = user;
    next();
  });
};

// Get all driver plan selections (Admin view)
router.get('/', async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'selectedDate';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const total = await DriverPlanSelection.countDocuments();
    const selections = await DriverPlanSelection.find()
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Add calculated payment details to each selection (async so vehicle assignment can be considered)
    const selectionsWithBreakdown = await Promise.all(selections.map(async s => {
      const paymentDetails = await calculatePaymentDetails(s);
      return {
        ...s,
        paymentDetails
      };
    }));
    
    res.json({
      data: selectionsWithBreakdown,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (err) {
    console.error('Get plan selections error:', err);
    res.status(500).json({ message: 'Failed to load plan selections' });
  }
});

// Get all plan selections by driver mobile number
router.get('/by-mobile/:mobile', async (req, res) => {
  try {
    const mobile = req.params.mobile;
    const selections = await DriverPlanSelection.find({ driverMobile: mobile })
      .sort({ selectedDate: -1 })
      .lean();
    // Ensure each selection includes a `paymentDetails` object (compute if missing)
    const selectionsWithDetails = await Promise.all(selections.map(async s => ({
      ...s,
      paymentDetails: s.paymentDetails || await calculatePaymentDetails(s)
    })));

    res.json(selectionsWithDetails);
  } catch (err) {
    console.error('Get plans by mobile error:', err);
    res.status(500).json({ message: 'Failed to load plans for this mobile' });
  }
});

// Get single plan selection by ID
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid plan selection ID' });
    }
    const selection = await DriverPlanSelection.findById(id).lean();
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }
    // Calculation logic
    let days = 0;
    if (selection.rentStartDate) {
      const start = new Date(selection.rentStartDate);
      let end = new Date();
      if (selection.status === 'inactive' && selection.rentPausedDate) {
        end = new Date(selection.rentPausedDate);
      }
      // Normalize to midnight for both dates
      const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      days = Math.floor((endMidnight - startMidnight) / (1000 * 60 * 60 * 24)) + 1;
      days = Math.max(1, days);
    }
    const rentPerDay = selection.rentPerDay || (selection.selectedRentSlab?.rentDay || 0) || 0;
    const accidentalCover = selection.planType === 'weekly' ? (selection.calculatedCover || (selection.selectedRentSlab?.accidentalCover || 105)) : 0;
    let depositDue = 0;
    if (selection.paymentType === 'security') {
      depositDue = Math.max(0, (selection.securityDeposit || 0) - (selection.paidAmount || 0));
    } else {
      depositDue = selection.securityDeposit || 0;
    }
    let rentDue = 0;
    if (selection.paymentType === 'rent') {
      rentDue = Math.max(0, (days * rentPerDay) - (selection.paidAmount || 0));
    } else {
      rentDue = days * rentPerDay;
    }
    const extraAmount = selection.extraAmount || 0;
    const extraReason = selection.extraReason || '';
    const totalAmount = depositDue + rentDue + accidentalCover + extraAmount;
    let dailyRentSummary = null;
    if (selection.rentStartDate) {
      dailyRentSummary = {
        hasStarted: true,
        totalDays: days,
        rentPerDay,
        totalDue: rentDue,
        startDate: selection.rentStartDate
      };
    }
    const response = {
      ...selection,
      paymentBreakdown: {
        securityDeposit: selection.securityDeposit || 0,
        rent: rentDue,
        rentType: selection.planType === 'weekly' ? 'weeklyRent' : 'dailyRent',
        accidentalCover,
        extraAmount,
        extraReason,
        totalAmount
      },
      dailyRentSummary
    };
    res.json(response);
  } catch (err) {
    console.error('Get plan selection error:', err);
    res.status(500).json({ message: 'Failed to load plan selection' });
  }
});

// Create new plan selection (Driver selects a plan)
router.post('/', authenticateDriver, async (req, res) => {
  try {
    const { planName, planType, securityDeposit, rentSlabs, selectedRentSlab } = req.body;
    
    if (!planName || !planType) {
      return res.status(400).json({ message: 'Plan name and type are required' });
    }

    // Get driver info
    const driver = await DriverSignup.findById(req.driver.id);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Check if driver already has an active selection
    const existingSelection = await DriverPlanSelection.findOne({
      driverSignupId: req.driver.id,
      status: 'active'
    });

    if (existingSelection) {
      return res.status(400).json({ message: 'Driver already has an active plan. Please complete or deactivate the current plan before selecting a new one.' });
    }

    // Calculate payment breakdown
    const deposit = securityDeposit || 0;
    const slab = selectedRentSlab || {};
    const rent = planType === 'weekly' ? (slab.weeklyRent || 0) : (slab.rentDay || 0);
    const cover = planType === 'weekly' ? (slab.accidentalCover || 105) : 0;
    const totalAmount = deposit + rent + cover;

    // Lock rent per day from selected slab
    const rentPerDay = typeof slab.rentDay === 'number' ? slab.rentDay : 0;

    // Create new selection with calculated values
    // Rent start date should NOT be set at plan selection creation.
    // Rent will only start when an admin assigns the driver to an active vehicle
    // (the vehicle update handler is responsible for setting `rentStartDate`).
    const rentStartDate = null;

    const selection = new DriverPlanSelection({
      driverSignupId: req.driver.id,
      driverUsername: driver.username,
      driverMobile: driver.mobile,
      planName,
      planType,
      securityDeposit: deposit,
      rentSlabs: rentSlabs || [],
      selectedRentSlab: selectedRentSlab || null,
      status: 'active',
      paymentStatus: 'pending',
      paymentMethod: 'Cash',
      // Store calculated breakdown
      calculatedDeposit: deposit,
      calculatedRent: rent,
      calculatedCover: cover,
      calculatedTotal: totalAmount,
      // rentStartDate will be set only when vehicle assigned & active
      rentStartDate: rentStartDate,
      rentPerDay: rentPerDay
    });

    await selection.save();

    res.status(201).json({
      message: 'Plan selected successfully',
      selection
    });
  } catch (err) {
    console.error('Create plan selection error:', err);
    res.status(500).json({ message: 'Failed to select plan' });
  }
});

// POST - Confirm payment for driver plan selection
router.post('/:id/confirm-payment', async (req, res) => {
  try {
    console.log('Confirm driver payment request received:', {
      id: req.params.id,
      body: req.body
    });

    const { paymentMode, paidAmount, paymentType } = req.body;

    if (!paymentMode || !['online', 'cash'].includes(paymentMode)) {
      console.log('Invalid payment mode:', paymentMode);
      return res.status(400).json({ message: 'Invalid payment mode. Must be online or cash' });
    }

    // Validate manual payment amount if provided
    if (paidAmount !== undefined && paidAmount !== null) {
      const amount = Number(paidAmount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Invalid payment amount. Must be a positive number' });
      }
    }

    // Validate payment type
    if (paymentType && !['rent', 'security'].includes(paymentType)) {
      return res.status(400).json({ message: 'Invalid payment type. Must be rent or security' });
    }

    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid plan selection ID' });
    }
    const selection = await DriverPlanSelection.findById(id);
    if (!selection) {
      console.log('Plan selection not found:', id);
      return res.status(404).json({ message: 'Plan selection not found' });
    }

    console.log('Current payment status:', selection.paymentStatus);

    if (selection.paymentStatus === 'completed') {
      return res.status(400).json({ message: 'Payment already completed' });
    }

    selection.paymentMode = paymentMode;
    selection.paymentStatus = 'completed';
    selection.paymentDate = new Date();
    
    // Store the manually entered payment amount and type (cumulative)
    if (paidAmount !== undefined && paidAmount !== null) {
      const previousAmount = selection.paidAmount || 0;
      const newPayment = Number(paidAmount);
      selection.paidAmount = previousAmount + newPayment;
      selection.paymentType = paymentType || 'rent';
      console.log('Adding payment:', newPayment, 'Previous:', previousAmount, 'New Total:', selection.paidAmount, 'Type:', selection.paymentType);
    }

    const updatedSelection = await selection.save();
    console.log('Payment confirmed successfully:', {
      id: updatedSelection._id,
      paymentMode: updatedSelection.paymentMode,
      paymentStatus: updatedSelection.paymentStatus,
      paidAmount: updatedSelection.paidAmount,
      paymentType: updatedSelection.paymentType
    });

    res.json({ 
      message: 'Payment confirmed successfully', 
      selection: updatedSelection 
    });
  } catch (error) {
    console.error('Error confirming driver payment:', error);
    res.status(500).json({ message: 'Failed to confirm payment', error: error.message });
  }
});

// GET - Daily rent summary from start date till today
router.get('/:id/rent-summary', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid plan selection ID' });
    }
    const selection = await DriverPlanSelection.findById(id).lean();
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }

    // If selection is inactive, stop calculating rent
    if (selection.status === 'inactive') {
      return res.json({
        hasStarted: false,
        totalDays: 0,
        rentPerDay: selection.rentPerDay || (selection.selectedRentSlab?.rentDay || 0),
        totalDue: 0,
        entries: [],
        status: selection.status
      });
    }

    // Determine effective start date: only use stored rentStartDate. Don't infer from vehicle assignment
    let effectiveStart = selection.rentStartDate ? new Date(selection.rentStartDate) : null;
    let inferredFromVehicle = false; // inference removed to ensure rent only starts when persisted via vehicle update

    if (!effectiveStart) {
      return res.json({
        hasStarted: false,
        totalDays: 0,
        rentPerDay: selection.rentPerDay || (selection.selectedRentSlab?.rentDay || 0),
        totalDue: 0,
        entries: [],
        status: selection.status
      });
    }

    const rentPerDay = selection.rentPerDay || (selection.selectedRentSlab?.rentDay || 0) || 0;
    const start = effectiveStart;
    const today = new Date();
    // Normalize to local midnight for day-diff consistency
    const toYmd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let cur = toYmd(start);
    const end = toYmd(today);

    // Build per-day entries inclusive of start and end
    const entries = [];
    let totalDays = 0;
    while (cur <= end) {
      entries.push({ date: cur.toISOString().slice(0, 10), amount: rentPerDay });
      totalDays += 1;
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      // Safety cap: avoid infinite loop due to bad dates
      if (totalDays > 3660) break; // ~10 years cap
    }

    const totalDue = rentPerDay * totalDays;
    return res.json({
      hasStarted: true,
      totalDays,
      rentPerDay,
      totalDue,
      startDate: effectiveStart,
      inferredFromVehicle,
      asOfDate: end.toISOString().slice(0, 10),
      entries,
      status: selection.status
    });
  } catch (error) {
    console.error('Get daily rent summary error:', error);
    res.status(500).json({ message: 'Failed to compute daily rent summary' });
  }
});

// Update plan selection status (Admin endpoint - no auth required for admin)
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid plan selection ID' });
    }
    const selection = await DriverPlanSelection.findById(id);
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }

    selection.status = status;
    
    // If making inactive, optionally stop rent calculation by clearing rentStartDate
    // Comment out the next line if you want to keep rent history when reactivating
    // if (status === 'inactive') {
    //   selection.rentStartDate = null;
    // }
    
    await selection.save();

    res.json({
      message: 'Plan selection status updated successfully',
      selection
    });
  } catch (err) {
    console.error('Update plan selection status error:', err);
    res.status(500).json({ message: 'Failed to update plan selection status' });
  }
});

// Update plan selection (Driver endpoint)
router.put('/:id', authenticateDriver, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid plan selection ID' });
    }
    const selection = await DriverPlanSelection.findById(id);
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }

    // Verify the driver owns this selection
    if (selection.driverSignupId.toString() !== req.driver.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    selection.status = status;
    await selection.save();

    res.json({
      message: 'Plan selection updated successfully',
      selection
    });
  } catch (err) {
    console.error('Update plan selection error:', err);
    res.status(500).json({ message: 'Failed to update plan selection' });
  }
});

// Delete plan selection
// Admin or driver can delete
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid plan selection ID' });
    }
    const selection = await DriverPlanSelection.findById(id);
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }

    // If driver token is present, check ownership
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      try {
        const SECRET = process.env.JWT_SECRET || 'dev_secret';
        const user = jwt.verify(token, SECRET);
        // If driver, check ownership
        if (user && user.role === 'driver') {
          if (selection.driverSignupId.toString() !== user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
          }
        }
      } catch (err) {
        // Invalid token, treat as admin (allow)
      }
    }

    await DriverPlanSelection.findByIdAndDelete(req.params.id);
    res.json({ message: 'Plan selection deleted successfully' });
  } catch (err) {
    console.error('Delete plan selection error:', err);
    res.status(500).json({ message: 'Failed to delete plan selection' });
  }
});

export default router;
