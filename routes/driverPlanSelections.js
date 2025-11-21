import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import DriverPlanSelection from '../models/driverPlanSelection.js';
import DriverSignup from '../models/driverSignup.js';

dotenv.config();

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'dev_secret';

// Middleware to verify driver JWT token
const authenticateDriver = (req, res, next) => {
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
    const selections = await DriverPlanSelection.find()
      .sort({ selectedDate: -1 })
      .lean();
    
    // Ensure all selections have calculated values
    const selectionsWithBreakdown = selections.map(s => {
      const deposit = s.calculatedDeposit || s.securityDeposit || 0;
      const rent = s.calculatedRent || (() => {
        const slab = s.selectedRentSlab || {};
        return s.planType === 'weekly' ? (slab.weeklyRent || 0) : (slab.rentDay || 0);
      })();
      const cover = s.calculatedCover || (() => {
        const slab = s.selectedRentSlab || {};
        return s.planType === 'weekly' ? (slab.accidentalCover || 105) : 0;
      })();
      const total = s.calculatedTotal || (deposit + rent + cover);
      
      return {
        ...s,
        calculatedDeposit: deposit,
        calculatedRent: rent,
        calculatedCover: cover,
        calculatedTotal: total
      };
    });
    
    res.json(selectionsWithBreakdown);
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
    res.json(selections);
  } catch (err) {
    console.error('Get plans by mobile error:', err);
    res.status(500).json({ message: 'Failed to load plans for this mobile' });
  }
});

// Get single plan selection by ID
router.get('/:id', async (req, res) => {
  try {
    const selection = await DriverPlanSelection.findById(req.params.id).lean();
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }
    
    // Use stored calculated values if available, otherwise calculate
    const deposit = selection.calculatedDeposit || selection.securityDeposit || 0;
    const rent = selection.calculatedRent || (() => {
      const slab = selection.selectedRentSlab || {};
      return selection.planType === 'weekly' ? (slab.weeklyRent || 0) : (slab.rentDay || 0);
    })();
    const cover = selection.calculatedCover || (() => {
      const slab = selection.selectedRentSlab || {};
      return selection.planType === 'weekly' ? (slab.accidentalCover || 105) : 0;
    })();
    const totalAmount = selection.calculatedTotal || (deposit + rent + cover);
    
    // Add payment breakdown to response
    // Compute daily rent summary if started
    let dailyRentSummary = null;
    try {
      if (selection.rentStartDate) {
        const rentPerDay = selection.rentPerDay || (selection.selectedRentSlab?.rentDay || 0) || 0;
        const start = new Date(selection.rentStartDate);
        const toYmd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        let cur = toYmd(start);
        const end = toYmd(new Date());
        let totalDays = 0;
        while (cur <= end) {
          totalDays += 1;
          cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
          if (totalDays > 3660) break;
        }
        dailyRentSummary = {
          hasStarted: true,
          totalDays,
          rentPerDay,
          totalDue: rentPerDay * totalDays,
          startDate: selection.rentStartDate
        };
      }
    } catch (e) {
      console.warn('Failed to compute dailyRentSummary:', e.message);
    }

    const response = {
      ...selection,
      paymentBreakdown: {
        securityDeposit: deposit,
        rent: rent,
        rentType: selection.planType === 'weekly' ? 'weeklyRent' : 'dailyRent',
        accidentalCover: cover,
        totalAmount: totalAmount
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
      // Deactivate previous selection
      existingSelection.status = 'completed';
      await existingSelection.save();
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
      // Start daily rent accrual from today
      rentStartDate: new Date(),
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

    const selection = await DriverPlanSelection.findById(req.params.id);
    if (!selection) {
      console.log('Plan selection not found:', req.params.id);
      return res.status(404).json({ message: 'Plan selection not found' });
    }

    console.log('Current payment status:', selection.paymentStatus);

    if (selection.paymentStatus === 'completed') {
      return res.status(400).json({ message: 'Payment already completed' });
    }

    selection.paymentMode = paymentMode;
    selection.paymentStatus = 'completed';
    selection.paymentDate = new Date();
    
    // Store the manually entered payment amount and type
    if (paidAmount !== undefined && paidAmount !== null) {
      selection.paidAmount = Number(paidAmount);
      selection.paymentType = paymentType || 'rent';
      console.log('Storing manual payment amount:', selection.paidAmount, 'Type:', selection.paymentType);
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
    const selection = await DriverPlanSelection.findById(req.params.id).lean();
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }

    // If status is inactive, stop calculating rent
    if (selection.status === 'inactive' || !selection.rentStartDate) {
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
    const start = new Date(selection.rentStartDate);
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
      startDate: selection.rentStartDate,
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

    const selection = await DriverPlanSelection.findById(req.params.id);
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

    const selection = await DriverPlanSelection.findById(req.params.id);
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
router.delete('/:id', authenticateDriver, async (req, res) => {
  try {
    const selection = await DriverPlanSelection.findById(req.params.id);
    if (!selection) {
      return res.status(404).json({ message: 'Plan selection not found' });
    }

    // Verify the driver owns this selection
    if (selection.driverSignupId.toString() !== req.driver.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await DriverPlanSelection.findByIdAndDelete(req.params.id);

    res.json({ message: 'Plan selection deleted successfully' });
  } catch (err) {
    console.error('Delete plan selection error:', err);
    res.status(500).json({ message: 'Failed to delete plan selection' });
  }
});

export default router;
