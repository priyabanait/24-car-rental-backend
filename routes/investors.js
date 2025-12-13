
import express from 'express';
import Investor from '../models/investor.js';
import InvestorSignup from '../models/investorSignup.js';
import InvestmentFD from '../models/investmentFD.js';
import { uploadToCloudinary } from '../lib/cloudinary.js';

const router = express.Router();
// GET investor form data by mobile number
router.get('/form/mobile/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const investor = await Investor.findOne({ phone }).lean();
    if (!investor) {
      return res.status(404).json({ error: 'Investor not found' });
    }
    res.json({ investor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch investor', message: error.message });
  }
});
// Update an investor signup credential
router.put('/signup/credentials/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await InvestorSignup.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Investor signup not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error updating investor signup:', err);
    res.status(400).json({ message: 'Failed to update investor signup', error: err.message });
  }
});

// Delete an investor signup credential
router.delete('/signup/credentials/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await InvestorSignup.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Investor signup not found' });
    }
    res.json({ message: 'Investor signup deleted', investor: deleted });
  } catch (err) {
    console.error('Error deleting investor signup:', err);
    res.status(400).json({ message: 'Failed to delete investor signup', error: err.message });
  }
});
// GET investor form data by investor ID
router.get('/form/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const investor = await Investor.findById(id).lean();
    if (!investor) {
      return res.status(404).json({ error: 'Investor not found' });
    }
    res.json({ investor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch investor', message: error.message });
  }
});

// INVESTOR SIGNUP (plain text password) - Stored in separate collection
router.post('/signup', async (req, res) => {
  try {
    const { investorName, email, phone, password } = req.body;
    if (!investorName || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password required' });
    }
    // Check if investor already exists in signup collection
    const existing = await InvestorSignup.findOne({ phone });
    if (existing) {
      return res.status(409).json({ error: 'Investor already exists' });
    }
    const newInvestorSignup = new InvestorSignup({ investorName, email, phone, password });
    await newInvestorSignup.save();

    // Create wallet entry for this phone number
    try {
      const InvestorWallet = (await import('../models/investorWallet.js')).default;
      const walletExists = await InvestorWallet.findOne({ phone });
      if (!walletExists) {
        await InvestorWallet.create({ phone, balance: 0, transactions: [] });
      }
    } catch (walletErr) {
      console.error('Failed to create wallet for investor:', walletErr);
    }

    res.status(201).json({ 
      message: 'Signup successful', 
      investor: {
        id: newInvestorSignup._id,
        investorName: newInvestorSignup.investorName,
        email: newInvestorSignup.email,
        phone: newInvestorSignup.phone,
        registrationCompleted: newInvestorSignup.registrationCompleted || false
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Signup failed', message: error.message });
  }
});

// INVESTOR LOGIN (plain text password) - Check in signup collection
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }
    const investorSignup = await InvestorSignup.findOne({ phone });
    if (!investorSignup) {
      return res.status(404).json({ error: 'Investor not found' });
    }
    if (investorSignup.password !== password) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    res.json({ 
      message: 'Login successful', 
      investor: {
        id: investorSignup._id,
        investorName: investorSignup.investorName,
        email: investorSignup.email,
        phone: investorSignup.phone,
        registrationCompleted: investorSignup.registrationCompleted || false
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

// INVESTOR SIGNUP WITH OTP - Stored in separate collection
router.post('/signup-otp', async (req, res) => {
  try {
    const { investorName, email, phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP required' });
    }
    // Check if investor already exists in signup collection
    const existing = await InvestorSignup.findOne({ phone });
    if (existing) {
      return res.status(409).json({ error: 'Investor already exists' });
    }
    // Create investor signup with OTP as password
    const newInvestorSignup = new InvestorSignup({ 
      investorName: investorName || 'Investor',
      email: email || '',
      phone, 
      password: otp 
    });
    await newInvestorSignup.save();
    res.status(201).json({ 
      message: 'Signup successful', 
      investor: {
        id: newInvestorSignup._id,
        investorName: newInvestorSignup.investorName,
        email: newInvestorSignup.email,
        phone: newInvestorSignup.phone,
        registrationCompleted: newInvestorSignup.registrationCompleted || false
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Signup failed', message: error.message });
  }
});

// INVESTOR LOGIN WITH OTP - Check in signup collection
router.post('/login-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP required' });
    }
    const investorSignup = await InvestorSignup.findOne({ phone });
    if (!investorSignup) {
      return res.status(404).json({ error: 'Investor not found' });
    }
    if (investorSignup.password !== otp) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    res.json({ 
      message: 'Login successful', 
      investor: {
        id: investorSignup._id,
        investorName: investorSignup.investorName,
        email: investorSignup.email,
        phone: investorSignup.phone,
        registrationCompleted: investorSignup.registrationCompleted || false
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

// GET all investors (only manual entries for admin panel)
router.get('/', async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const total = await Investor.countDocuments();
    const list = await Investor.find()
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Transform _id to id for frontend compatibility
    const transformedList = list.map(investor => ({
      ...investor,
      id: investor._id.toString()
    }));
    
    res.json({
      data: transformedList,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error('Error fetching investors:', error);
    res.status(500).json({ error: 'Failed to fetch investors', message: error.message });
  }
});

// GET investor signup credentials (self-registered)
router.get('/signup/credentials', async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'signupDate';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const total = await InvestorSignup.countDocuments();
    const list = await InvestorSignup.find()
      .select('investorName email phone password status kycStatus signupDate')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
    
    res.json({
      data: list,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error('Error fetching investor signup credentials:', error);
    res.status(500).json({ error: 'Failed to fetch signup credentials', message: error.message });
  }
});

// POST - Create new investor OR complete investor registration
router.post('/', async (req, res) => {
  try {
    // Check if this is a registration completion for an existing signup
    const { investorId, phone } = req.body;
    
    if (investorId || phone) {
      // This is a registration completion
      let investorSignup;
      
      if (investorId) {
        investorSignup = await InvestorSignup.findById(investorId);
      } else if (phone) {
        investorSignup = await InvestorSignup.findOne({ phone });
      }
      
      if (!investorSignup) {
        return res.status(404).json({ error: 'Investor not found' });
      }

      // Handle document uploads to Cloudinary
      const documentFields = ['profilePhoto', 'aadharDocument', 'aadharDocumentBack', 'panDocument', 'bankDocument'];
      const uploadedDocs = {};

      for (const field of documentFields) {
        if (req.body[field] && req.body[field].startsWith('data:')) {
          try {
            const result = await uploadToCloudinary(req.body[field], `investors/${investorSignup._id}/${field}`);
            uploadedDocs[field] = result.secure_url;
          } catch (uploadErr) {
            console.error(`Failed to upload ${field}:`, uploadErr);
          }
        }
      }

      // Update registration data
      const updateData = {
        investorName: req.body.investorName || investorSignup.investorName,
        email: req.body.email || investorSignup.email,
        address: req.body.address,
        city: req.body.city,
        state: req.body.state,
        pincode: req.body.pincode,
        dateOfBirth: req.body.dateOfBirth,
        aadharNumber: req.body.aadharNumber,
        panNumber: req.body.panNumber,
        bankName: req.body.bankName,
        accountNumber: req.body.accountNumber,
        ifscCode: req.body.ifscCode,
        accountHolderName: req.body.accountHolderName,
        accountBranchName: req.body.accountBranchName,
        ...uploadedDocs,
        registrationCompleted: true,
        status: 'active'
      };

      // Remove base64 data to prevent large document size
      documentFields.forEach(field => {
        if (updateData[field]?.startsWith('data:')) {
          delete updateData[field];
        }
      });

      // Update the investor signup record
      const updated = await InvestorSignup.findByIdAndUpdate(
        investorSignup._id,
        updateData,
        { new: true, runValidators: true }
      );

      // Store completed registration in Investor collection
      const investorData = {
        investorName: updated.investorName,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        city: updated.city,
        state: updated.state,
        pincode: updated.pincode,
        dateOfBirth: updated.dateOfBirth,
        aadharNumber: updated.aadharNumber,
        panNumber: updated.panNumber,
        bankName: updated.bankName,
        accountNumber: updated.accountNumber,
        ifscCode: updated.ifscCode,
        accountHolderName: updated.accountHolderName,
        accountBranchName: updated.accountBranchName,
        profilePhoto: updated.profilePhoto,
        aadharDocument: updated.aadharDocument,
        aadharDocumentBack: updated.aadharDocumentBack,
        panDocument: updated.panDocument,
        bankDocument: updated.bankDocument,
        status: updated.status,
        kycStatus: updated.kycStatus,
        isManualEntry: false // Mark as self-registered
      };
      // Upsert investor record
      const savedInvestor = await Investor.findOneAndUpdate(
        { phone: updated.phone },
        investorData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return res.json({
        message: 'Registration completed successfully',
        investor: {
          id: savedInvestor._id,
          ...investorData
        }
      });
    }

    // Otherwise, this is a manual admin entry
    // Handle document uploads to Cloudinary
    const documentFields = ['profilePhoto', 'aadharDocument', 'aadharDocumentBack', 'panDocument', 'bankDocument'];
    const uploadedDocs = {};
    
    // Generate a temporary ID for folder structure
    const tempId = Date.now();

    for (const field of documentFields) {
      if (req.body[field] && req.body[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(req.body[field], `investors/${tempId}/${field}`);
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
      }
    }

    // Create investor with uploaded document URLs
    const investorData = {
      ...req.body,
      ...uploadedDocs,
      isManualEntry: true, // Mark as manually added by admin
      registrationCompleted: true // Mark registration as completed when admin fills the form
    };

    // Remove base64 data to prevent large document size
    documentFields.forEach(field => {
      if (investorData[field]?.startsWith('data:')) {
        delete investorData[field];
      }
    });

    const newInvestor = new Investor(investorData);
    const saved = await newInvestor.save();
    const result = {
      ...saved.toObject(),
      id: saved._id.toString()
    };
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating investor:', error);
    res.status(400).json({ error: 'Failed to create investor', message: error.message });
  }
});

// PUT - Update investor
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Handle document uploads to Cloudinary
    const documentFields = ['profilePhoto', 'aadharDocument', 'aadharDocumentBack', 'panDocument', 'bankDocument'];
    const uploadedDocs = {};

    for (const field of documentFields) {
      if (req.body[field] && req.body[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(req.body[field], `investors/${id}/${field}`);
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
      }
    }

    // Update investor data with uploaded document URLs
    const updateData = {
      ...req.body,
      ...uploadedDocs
    };

    // Remove base64 data to prevent large document size
    documentFields.forEach(field => {
      if (updateData[field]?.startsWith('data:')) {
        delete updateData[field];
      }
    });

    const updated = await Investor.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Investor not found' });
    }
    
    const result = {
      ...updated.toObject(),
      id: updated._id.toString()
    };
    res.json(result);
  } catch (error) {
    console.error('Error updating investor:', error);
    res.status(400).json({ error: 'Failed to update investor', message: error.message });
  }
});

// DELETE - Remove investor
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Investor.findByIdAndDelete(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Investor not found' });
    }
    
    res.json({ message: 'Investor deleted successfully', investor: deleted });
  } catch (error) {
    console.error('Error deleting investor:', error);
    res.status(400).json({ error: 'Failed to delete investor', message: error.message });
  }
});

// POST - Create FD record for investor
router.post('/fd-records/:id', async (req, res) => {
  try {
    const investorId = req.params.id;
    
    // Find investor signup
    const investorSignup = await InvestorSignup.findById(investorId);
    if (!investorSignup) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    const {
      investmentDate,
      paymentMethod,
      investmentRate,
      investmentAmount,
      planId,
      fdType,
      termMonths,
      termYears,
      status,
      notes,
      paymentMode,
      address
    } = req.body;

    // Calculate maturity date and amount
    let maturityDate = new Date(investmentDate);
    if (fdType === 'monthly' && termMonths) {
      maturityDate.setMonth(maturityDate.getMonth() + termMonths);
    } else if (fdType === 'yearly' && termYears) {
      maturityDate.setFullYear(maturityDate.getFullYear() + termYears);
    }

    const termInYears = fdType === 'monthly' ? termMonths / 12 : termYears;
    const maturityAmount = investmentAmount * Math.pow(1 + investmentRate / 100, termInYears);

    // Create new FD record
    const newFD = new InvestmentFD({
      investorId: investorId,
      investorName: investorSignup.investorName,
      email: investorSignup.email || '',
      phone: investorSignup.phone,
      address: address || investorSignup.address || '',
      investmentDate,
      paymentMethod,
      investmentRate,
      investmentAmount,
      planId: planId || null,
      fdType,
      termMonths: fdType === 'monthly' ? termMonths : undefined,
      termYears: fdType === 'yearly' ? termYears : undefined,
      status: status || 'active',
      maturityDate,
      maturityAmount,
      notes: notes || '',
      paymentMode: paymentMode || 'online',
      paymentStatus: 'completed',
      paymentDate: new Date()
    });

    const savedFD = await newFD.save();
    
    res.status(201).json({
      message: 'FD record created successfully',
      fd: savedFD
    });
  } catch (error) {
    console.error('Error creating FD record:', error);
    res.status(500).json({ error: 'Failed to create FD record', message: error.message });
  }
});

// GET investor FD records by investor ID
router.get('/fd-records/:id', async (req, res) => {
  try {
    const investorId = req.params.id;
    
    // Find investor signup to get phone number
    const investorSignup = await InvestorSignup.findById(investorId);
    if (!investorSignup) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    // Find all FD records matching the investor ID or phone number (for backward compatibility)
    const fdRecords = await InvestmentFD.find({ 
      $or: [
        { investorId: investorId },
        { phone: investorSignup.phone }
      ]
    }).sort({ investmentDate: -1 });
    
    res.json({
      investor: {
        id: investorSignup._id,
        investorName: investorSignup.investorName,
        email: investorSignup.email,
        phone: investorSignup.phone
      },
      fdRecords: fdRecords,
      totalRecords: fdRecords.length,
      totalInvestment: fdRecords.reduce((sum, fd) => sum + (fd.investmentAmount || 0), 0),
      totalMaturityAmount: fdRecords.reduce((sum, fd) => sum + (fd.maturityAmount || 0), 0)
    });
  } catch (error) {
    console.error('Error fetching investor FD records:', error);
    res.status(500).json({ error: 'Failed to fetch FD records', message: error.message });
  }
});

// Forgot Password - Update password using phone number
router.post('/forgot-password', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    
    // Validate input
    if (!phone || !newPassword) {
      return res.status(400).json({ error: 'Phone number and new password required' });
    }

    // Find investor by phone number
    const investorSignup = await InvestorSignup.findOne({ phone });
    if (!investorSignup) {
      return res.status(404).json({ error: 'Investor not found with this phone number' });
    }

    // Update password (plain text)
    investorSignup.password = newPassword;
    await investorSignup.save();

    res.json({ 
      message: 'Password updated successfully',
      investor: {
        id: investorSignup._id,
        investorName: investorSignup.investorName,
        email: investorSignup.email,
        phone: investorSignup.phone
      }
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Password reset failed', message: error.message });
  }
});

export default router;
