import express from 'express';
import InvestmentFD from '../models/investmentFD.js';
import InvestmentPlan from '../models/investmentPlan.js';

const router = express.Router();

// GET all investment FDs
router.get('/', async (req, res) => {
  try {
    const { investorId } = req.query;
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'investmentDate';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    // If investorId is provided, filter by it
    const filter = investorId ? { investorId } : {};
    
    const total = await InvestmentFD.countDocuments(filter);
    const investments = await InvestmentFD.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);
    
    res.json({
      data: investments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error('Error fetching investment FDs:', error);
    res.status(500).json({ error: 'Failed to fetch investment FDs', message: error.message });
  }
});

// GET single investment FD by ID
router.get('/:id', async (req, res) => {
  try {
    const investment = await InvestmentFD.findById(req.params.id);
    if (!investment) {
      return res.status(404).json({ error: 'Investment FD not found' });
    }
    res.json(investment);
  } catch (error) {
    console.error('Error fetching investment FD:', error);
    res.status(500).json({ error: 'Failed to fetch investment FD', message: error.message });
  }
});

// POST - Create new investment FD
router.post('/', async (req, res) => {
  try {
    const {
      investorId,
      investorName,
      email,
      phone,
      address,
      investmentDate,
      paymentMethod,
      investmentRate,
      investmentAmount,
      planId,
      fdType,
      termMonths,
      termYears,
      status,
      maturityDate,
      notes,
      paymentMode,
      paymentStatus
    } = req.body;

    // Validation
    if (!investorName || !phone || !address || !investmentDate || !paymentMethod || !investmentRate || !investmentAmount || !fdType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate FD type
    if (!['monthly', 'yearly'].includes(fdType)) {
      return res.status(400).json({ error: 'Invalid FD type. Must be monthly or yearly' });
    }

    // Validate term based on FD type
    if (fdType === 'monthly' && (!termMonths || termMonths < 1 || termMonths > 12)) {
      return res.status(400).json({ error: 'For monthly FD, term must be between 1-12 months' });
    }
    if (fdType === 'yearly' && (!termYears || termYears < 1 || termYears > 10)) {
      return res.status(400).json({ error: 'For yearly FD, term must be between 1-10 years' });
    }

    // Validate payment method
    const validPaymentMethods = ['Cash', 'Bank Transfer', 'Cheque', 'Online', 'UPI'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    // Validate numbers
    if (isNaN(investmentRate) || parseFloat(investmentRate) < 0) {
      return res.status(400).json({ error: 'Invalid investment rate' });
    }
    if (isNaN(investmentAmount) || parseFloat(investmentAmount) <= 0) {
      return res.status(400).json({ error: 'Invalid investment amount' });
    }

    // Calculate maturity date if not provided
    let calculatedMaturityDate = maturityDate ? new Date(maturityDate) : null;
    if (!calculatedMaturityDate) {
      const invDate = new Date(investmentDate);
      if (fdType === 'monthly') {
        calculatedMaturityDate = new Date(invDate.setMonth(invDate.getMonth() + parseInt(termMonths)));
      } else if (fdType === 'yearly') {
        calculatedMaturityDate = new Date(invDate.setFullYear(invDate.getFullYear() + parseInt(termYears)));
      }
    }

    // Resolve plan name if planId provided
    let resolvedPlanId = null;
    let resolvedPlanName = '';
    if (planId) {
      try {
        const plan = await InvestmentPlan.findById(planId).select('name');
        if (!plan) {
          return res.status(400).json({ error: 'Invalid planId: plan not found' });
        }
        resolvedPlanId = plan._id;
        resolvedPlanName = plan.name || '';
      } catch (e) {
        return res.status(400).json({ error: 'Invalid planId format' });
      }
    }

    // Create new investment FD
      // Calculate maturity amount (compound interest)
      const principal = parseFloat(investmentAmount);
      const rate = parseFloat(investmentRate) / 100;
      const n = fdType === 'monthly' ? 12 : 1; // compounding frequency
      const time = fdType === 'monthly' ? parseFloat(termMonths) / 12 : parseFloat(termYears);
      const maturityAmount = principal * Math.pow(1 + rate / n, n * time);

      const newInvestment = new InvestmentFD({
        investorId: investorId || null,
        investorName: investorName.trim(),
        email: email ? email.trim() : '',
        phone: phone.trim(),
        address: address.trim(),
        investmentDate: new Date(investmentDate),
        paymentMethod,
        investmentRate: parseFloat(investmentRate),
        investmentAmount: principal,
        planId: resolvedPlanId,
        planName: resolvedPlanName,
        fdType,
        termMonths: fdType === 'monthly' ? parseInt(termMonths) : undefined,
        termYears: fdType === 'yearly' ? parseInt(termYears) : undefined,
        status: status || 'active',
        maturityDate: calculatedMaturityDate,
        notes: notes || '',
        maturityAmount,
        ...(paymentMode && { paymentMode }),
        paymentStatus: paymentStatus || 'pending',
        ...(paymentStatus === 'completed' && { paymentDate: new Date() })
      });

    const savedInvestment = await newInvestment.save();
    res.status(201).json(savedInvestment);
  } catch (error) {
    console.error('Error creating investment FD:', error);
    res.status(500).json({ error: 'Failed to create investment FD', message: error.message });
  }
});

// PUT - Update investment FD
router.put('/:id', async (req, res) => {
  try {
    const {
      investorName,
      email,
      phone,
      address,
      investmentDate,
      paymentMethod,
      investmentRate,
      investmentAmount,
      planId,
      fdType,
      termMonths,
      termYears,
      status,
      maturityDate,
      notes
    } = req.body;

    // Find investment
    const investment = await InvestmentFD.findById(req.params.id);
    if (!investment) {
      return res.status(404).json({ error: 'Investment FD not found' });
    }

    // Validate FD type if provided
    if (fdType && !['monthly', 'yearly'].includes(fdType)) {
      return res.status(400).json({ error: 'Invalid FD type. Must be monthly or yearly' });
    }

    // Validate term based on FD type
    if (fdType === 'monthly' && termMonths !== undefined && (termMonths < 1 || termMonths > 12)) {
      return res.status(400).json({ error: 'For monthly FD, term must be between 1-12 months' });
    }
    if (fdType === 'yearly' && termYears !== undefined && (termYears < 1 || termYears > 10)) {
      return res.status(400).json({ error: 'For yearly FD, term must be between 1-10 years' });
    }

    // Validate FD type if provided
    if (fdType && !['monthly', 'yearly'].includes(fdType)) {
      return res.status(400).json({ error: 'Invalid FD type. Must be monthly or yearly' });
    }

    // Validate term based on FD type
    if (fdType === 'monthly' && termMonths !== undefined && (termMonths < 1 || termMonths > 12)) {
      return res.status(400).json({ error: 'For monthly FD, term must be between 1-12 months' });
    }
    if (fdType === 'yearly' && termYears !== undefined && (termYears < 1 || termYears > 10)) {
      return res.status(400).json({ error: 'For yearly FD, term must be between 1-10 years' });
    }

    // Validate payment method if provided
    if (paymentMethod) {
      const validPaymentMethods = ['Cash', 'Bank Transfer', 'Cheque', 'Online', 'UPI'];
      if (!validPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: 'Invalid payment method' });
      }
    }

    // Validate numbers if provided
    if (investmentRate !== undefined && (isNaN(investmentRate) || parseFloat(investmentRate) < 0)) {
      return res.status(400).json({ error: 'Invalid investment rate' });
    }
    if (investmentAmount !== undefined && (isNaN(investmentAmount) || parseFloat(investmentAmount) <= 0)) {
      return res.status(400).json({ error: 'Invalid investment amount' });
    }

    // Update fields
    if (investorName !== undefined) investment.investorName = investorName.trim();
    if (email !== undefined) investment.email = email.trim();
    if (phone !== undefined) investment.phone = phone.trim();
    if (address !== undefined) investment.address = address.trim();
    if (investmentDate !== undefined) investment.investmentDate = new Date(investmentDate);
    if (paymentMethod !== undefined) investment.paymentMethod = paymentMethod;
    if (investmentRate !== undefined) investment.investmentRate = parseFloat(investmentRate);
    if (investmentAmount !== undefined) investment.investmentAmount = parseFloat(investmentAmount);
    if (fdType !== undefined) investment.fdType = fdType;
    if (termMonths !== undefined) investment.termMonths = investment.fdType === 'monthly' ? parseInt(termMonths) : undefined;
    if (termYears !== undefined) investment.termYears = investment.fdType === 'yearly' ? parseInt(termYears) : undefined;

    // Recalculate maturityAmount if relevant fields changed
    if (
      investmentAmount !== undefined || investmentRate !== undefined || fdType !== undefined || termMonths !== undefined || termYears !== undefined
    ) {
      const principal = investment.investmentAmount;
      const rate = investment.investmentRate / 100;
      const n = investment.fdType === 'monthly' ? 12 : 1;
      const time = investment.fdType === 'monthly' ? (investment.termMonths || 0) / 12 : (investment.termYears || 0);
      investment.maturityAmount = principal * Math.pow(1 + rate / n, n * time);
    }

    // Update plan if provided
    if (planId !== undefined) {
      if (!planId) {
        investment.planId = null;
        investment.planName = '';
      } else {
        try {
          const plan = await InvestmentPlan.findById(planId).select('name');
          if (!plan) {
            return res.status(400).json({ error: 'Invalid planId: plan not found' });
          }
          investment.planId = plan._id;
          investment.planName = plan.name || '';
        } catch (e) {
          return res.status(400).json({ error: 'Invalid planId format' });
        }
      }
    }
    if (status !== undefined) investment.status = status;
    
    // Recalculate maturity date if investment date or term changed
    if ((investmentDate !== undefined || fdType !== undefined || termMonths !== undefined || termYears !== undefined) && maturityDate === undefined) {
      const invDate = new Date(investment.investmentDate);
      if (investment.fdType === 'monthly' && investment.termMonths) {
        investment.maturityDate = new Date(invDate.setMonth(invDate.getMonth() + investment.termMonths));
      } else if (investment.fdType === 'yearly' && investment.termYears) {
        investment.maturityDate = new Date(invDate.setFullYear(invDate.getFullYear() + investment.termYears));
      }
    } else if (maturityDate !== undefined) {
      investment.maturityDate = maturityDate ? new Date(maturityDate) : null;
    }
    
    if (notes !== undefined) investment.notes = notes;

    const updatedInvestment = await investment.save();
    res.json(updatedInvestment);
  } catch (error) {
    console.error('Error updating investment FD:', error);
    res.status(500).json({ error: 'Failed to update investment FD', message: error.message });
  }
});

// DELETE - Remove investment FD
router.delete('/:id', async (req, res) => {
  try {
    const investment = await InvestmentFD.findByIdAndDelete(req.params.id);
    if (!investment) {
      return res.status(404).json({ error: 'Investment FD not found' });
    }
    res.json({ message: 'Investment FD deleted successfully', investment });
  } catch (error) {
    console.error('Error deleting investment FD:', error);
    res.status(500).json({ error: 'Failed to delete investment FD', message: error.message });
  }
});

// POST - Confirm payment for FD
router.post('/:id/confirm-payment', async (req, res) => {
  try {
    console.log('Confirm payment request received:', {
      id: req.params.id,
      body: req.body
    });

    const { paymentMode } = req.body;

    if (!paymentMode || !['online', 'cash'].includes(paymentMode)) {
      console.log('Invalid payment mode:', paymentMode);
      return res.status(400).json({ error: 'Invalid payment mode. Must be online or cash' });
    }

    const investment = await InvestmentFD.findById(req.params.id);
    if (!investment) {
      console.log('Investment FD not found:', req.params.id);
      return res.status(404).json({ error: 'Investment FD not found' });
    }

    console.log('Current investment payment status:', investment.paymentStatus);

    if (investment.paymentStatus === 'completed') {
      return res.status(400).json({ error: 'Payment already completed' });
    }

    investment.paymentMode = paymentMode;
    investment.paymentStatus = 'completed';
    investment.paymentDate = new Date();

    const updatedInvestment = await investment.save();
    console.log('Payment confirmed successfully:', {
      id: updatedInvestment._id,
      paymentMode: updatedInvestment.paymentMode,
      paymentStatus: updatedInvestment.paymentStatus
    });

    res.json({ 
      message: 'Payment confirmed successfully', 
      investment: updatedInvestment 
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Failed to confirm payment', message: error.message });
  }
});

// GET statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const [totalInvestments, activeInvestments, stats] = await Promise.all([
      InvestmentFD.countDocuments(),
      InvestmentFD.countDocuments({ status: 'active' }),
      InvestmentFD.aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$investmentAmount' },
            avgRate: { $avg: '$investmentRate' }
          }
        }
      ])
    ]);

    res.json({
      totalInvestments,
      activeInvestments,
      totalAmount: stats[0]?.totalAmount || 0,
      avgRate: stats[0]?.avgRate || 0
    });
  } catch (error) {
    console.error('Error fetching investment FD stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics', message: error.message });
  }
});

export default router;
