import express from 'express';
import axios from 'axios';

const router = express.Router();

// ZWITCH API configuration
const ZWITCH_API_URL = process.env.ZWITCH_API_URL || 'https://api.zwitch.io/v1';
const ZWITCH_API_KEY = process.env.ZWITCH_API_KEY;
const ZWITCH_API_SECRET = process.env.ZWITCH_API_SECRET;

// Middleware to verify authentication
const verifyAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token === 'mock') {
    // For development, allow mock token
    req.user = { id: 1, role: 'super_admin' };
    return next();
  }
  // Add your JWT verification logic here
  next();
};

/**
 * Test endpoint to check ZWITCH configuration
 * GET /api/payments/zwitch/test
 */
router.get('/zwitch/test', verifyAuth, (req, res) => {
  res.json({
    configured: !!(ZWITCH_API_KEY && ZWITCH_API_SECRET),
    apiUrl: ZWITCH_API_URL,
    hasApiKey: !!ZWITCH_API_KEY,
    hasApiSecret: !!ZWITCH_API_SECRET,
    apiKeyPrefix: ZWITCH_API_KEY ? ZWITCH_API_KEY.substring(0, 15) + '...' : 'NOT_SET',
    timestamp: new Date().toISOString()
  });
});

/**
 * Process payout via ZWITCH
 * POST /api/payments/zwitch/payout
 */
router.post('/zwitch/payout', verifyAuth, async (req, res) => {
  try {
    const {
      driverId,
      amount,
      accountNumber,
      ifsc,
      accountHolderName,
      purpose,
      paymentId
    } = req.body;

    // Validate required fields
    if (!driverId || !amount || !accountNumber || !ifsc || !accountHolderName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate amount
    if (amount < 1 || amount > 100000) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be between ₹1 and ₹100,000'
      });
    }

    // Check if ZWITCH credentials are configured
    if (!ZWITCH_API_KEY || !ZWITCH_API_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured. Please contact administrator.'
      });
    }

    // Generate unique reference ID
    const referenceId = `24CR_${Date.now()}_${driverId}`;

    console.log('Processing ZWITCH payout:', {
      referenceId,
      amount,
      accountNumber: `****${accountNumber.slice(-4)}`,
      ifsc,
      accountHolderName,
      apiUrl: ZWITCH_API_URL,
      fullUrl: `${ZWITCH_API_URL}/transfers`,
      hasApiKey: !!ZWITCH_API_KEY,
      hasApiSecret: !!ZWITCH_API_SECRET
    });

    const payoutPayload = {
      reference_id: referenceId,
      amount: amount * 100, // Convert to paise
      purpose: purpose || 'Driver Payment - weekly_payout',
      beneficiary: {
        name: accountHolderName,
        account_number: accountNumber,
        ifsc: ifsc,
        email: `driver${driverId}@24carrental.com`,
        phone: ''
      },
      mode: 'IMPS'
    };

    console.log('Payout payload:', JSON.stringify(payoutPayload, null, 2));

    const authHeader = `Bearer ${ZWITCH_API_KEY}:${ZWITCH_API_SECRET}`;
    console.log('Auth header (first 30 chars):', authHeader.substring(0, 30) + '...');

    // Call ZWITCH Transfer API (correct endpoint)
    const zwitchResponse = await axios.post(
      `${ZWITCH_API_URL}/transfers`,
      payoutPayload,
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('ZWITCH response:', zwitchResponse.data);

    // Update transaction in database
    const { default: Transaction } = await import('../models/transaction.js');
    let transaction;
    
    if (paymentId) {
      // Update existing transaction
      transaction = await Transaction.findByIdAndUpdate(
        paymentId,
        {
          status: zwitchResponse.data.status === 'SUCCESS' ? 'completed' : 'processing',
          transactionId: zwitchResponse.data.id,
          zwitchReferenceId: referenceId,
          method: 'bank_transfer',
          processedAt: new Date()
        },
        { new: true }
      );
    } else {
      // Create new transaction
      transaction = await Transaction.create({
        driverId,
        amount,
        type: 'weekly_payout',
        status: zwitchResponse.data.status === 'SUCCESS' ? 'completed' : 'processing',
        transactionId: zwitchResponse.data.id,
        zwitchReferenceId: referenceId,
        method: 'bank_transfer',
        accountNumber: `****${accountNumber.slice(-4)}`,
        date: new Date(),
        processedAt: new Date()
      });
    }

    return res.json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        referenceId,
        zwitchTransactionId: zwitchResponse.data.id,
        status: zwitchResponse.data.status,
        amount,
        transaction
      }
    });

  } catch (error) {
    console.error('ZWITCH payout error:');
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.response?.data?.error || 'Payment processing failed',
      error: error.message,
      details: error.response?.data
    });
  }
});

/**
 * Check payout status
 * GET /api/payments/zwitch/status/:referenceId
 */
router.get('/zwitch/status/:referenceId', verifyAuth, async (req, res) => {
  try {
    const { referenceId } = req.params;

    if (!ZWITCH_API_KEY || !ZWITCH_API_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    // Call ZWITCH Status API (correct endpoint)
    const zwitchResponse = await axios.get(
      `${ZWITCH_API_URL}/transfers/${referenceId}`,
      {
        headers: {
          'Authorization': `Bearer ${ZWITCH_API_KEY}:${ZWITCH_API_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.json({
      success: true,
      data: zwitchResponse.data
    });

  } catch (error) {
    console.error('Status check error:', error.response?.data || error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error.message
    });
  }
});

/**
 * Verify bank account
 * POST /api/payments/zwitch/verify-account
 */
router.post('/zwitch/verify-account', verifyAuth, async (req, res) => {
  try {
    const { accountNumber, ifsc } = req.body;

    if (!accountNumber || !ifsc) {
      return res.status(400).json({
        success: false,
        message: 'Account number and IFSC code are required'
      });
    }

    if (!ZWITCH_API_KEY || !ZWITCH_API_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    // Call ZWITCH Bank Verification API
    const zwitchResponse = await axios.post(
      `${ZWITCH_API_URL}/verification/bank-account`,
      {
        account_number: accountNumber,
        ifsc: ifsc
      },
      {
        headers: {
          'Authorization': `Bearer ${ZWITCH_API_KEY}:${ZWITCH_API_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.json({
      success: true,
      data: zwitchResponse.data
    });

  } catch (error) {
    console.error('Bank verification error:', error.response?.data || error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Bank account verification failed',
      error: error.message
    });
  }
});

/**
 * Webhook endpoint for ZWITCH callbacks
 * POST /api/payments/zwitch/webhook
 */
router.post('/zwitch/webhook', express.json(), async (req, res) => {
  try {
    const { event, data } = req.body;

    console.log('ZWITCH Webhook received:', event, data);

    // Verify webhook signature (implement based on ZWITCH documentation)
    // const signature = req.headers['x-zwitch-signature'];
    // if (!verifyWebhookSignature(signature, req.body)) {
    //   return res.status(401).json({ success: false, message: 'Invalid signature' });
    // }

    // Update transaction status based on webhook event
    if (event === 'payout.success' || event === 'payout.failed') {
      const { default: Transaction } = await import('../models/transaction.js');
      await Transaction.findOneAndUpdate(
        { zwitchReferenceId: data.reference_id },
        {
          status: event === 'payout.success' ? 'completed' : 'failed',
          failureReason: data.failure_reason || null,
          updatedAt: new Date()
        }
      );
    }

    return res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Driver Payments Data ====================

// Mock driver payments data
let driverPayments = [
  {
    id: 1,
    driverId: 'DR001',
    driverName: 'Rajesh Kumar',
    phone: '+91-9876543210',
    paymentType: 'weekly_earnings',
    period: 'Week 1, Nov 2024',
    amount: 15000,
    commissionAmount: 2250,
    commissionRate: 15,
    netPayment: 12750,
    totalTrips: 45,
    totalDistance: 450,
    status: 'paid',
    paymentMethod: 'Bank Transfer',
    transactionId: 'TXN123456789',
    paymentDate: '2024-11-01',
    bankDetails: {
      accountName: 'Rajesh Kumar',
      accountNumber: '1234567890',
      ifsc: 'HDFC0001234',
      bank: 'HDFC Bank'
    }
  },
  {
    id: 2,
    driverId: 'DR002',
    driverName: 'Priya Sharma',
    phone: '+91-9876543211',
    paymentType: 'weekly_earnings',
    period: 'Week 1, Nov 2024',
    amount: 18500,
    commissionAmount: 2775,
    commissionRate: 15,
    netPayment: 15725,
    totalTrips: 52,
    totalDistance: 520,
    status: 'pending',
    paymentMethod: 'UPI',
    transactionId: null,
    paymentDate: '2024-11-08',
    bankDetails: {
      accountName: 'Priya Sharma',
      upiId: 'priya@paytm'
    }
  },
  {
    id: 3,
    driverId: 'DR003',
    driverName: 'Amit Singh',
    phone: '+91-9876543212',
    paymentType: 'bonus',
    period: 'November 2024',
    amount: 5000,
    commissionAmount: 0,
    commissionRate: 0,
    netPayment: 5000,
    totalTrips: 100,
    totalDistance: 1000,
    status: 'processing',
    paymentMethod: 'Bank Transfer',
    transactionId: 'TXN987654321',
    paymentDate: '2024-11-07',
    bankDetails: {
      accountName: 'Amit Singh',
      accountNumber: '9876543210',
      ifsc: 'ICIC0001234',
      bank: 'ICICI Bank'
    }
  },
  {
    id: 4,
    driverId: 'DR004',
    driverName: 'Sunita Patel',
    phone: '+91-9876543213',
    paymentType: 'weekly_earnings',
    period: 'Week 1, Nov 2024',
    amount: 12000,
    commissionAmount: 1800,
    commissionRate: 15,
    netPayment: 10200,
    totalTrips: 38,
    totalDistance: 380,
    status: 'failed',
    paymentMethod: 'Bank Transfer',
    transactionId: 'TXN456789123',
    paymentDate: '2024-11-05',
    bankDetails: {
      accountName: 'Sunita Patel',
      accountNumber: '4567891230',
      ifsc: 'SBIN0001234',
      bank: 'State Bank of India'
    }
  }
];

// GET all driver payments
router.get('/drivers', verifyAuth, (req, res) => {
  res.json(driverPayments);
});

// GET single payment by ID
router.get('/drivers/:id', verifyAuth, (req, res) => {
  const payment = driverPayments.find(p => p.id === parseInt(req.params.id));
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  res.json(payment);
});

// POST - Create new payment
router.post('/drivers/create', verifyAuth, (req, res) => {
  try {
    const newId = driverPayments.length > 0 ? Math.max(...driverPayments.map(p => p.id)) + 1 : 1;
    const newPayment = {
      id: newId,
      ...req.body,
      transactionId: req.body.transactionId || null,
      paymentDate: req.body.paymentDate || new Date().toISOString().split('T')[0]
    };
    
    driverPayments.push(newPayment);
    res.status(201).json(newPayment);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(400).json({ error: 'Failed to create payment', message: error.message });
  }
});

// PUT - Update payment
router.put('/drivers/:id', verifyAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const index = driverPayments.findIndex(p => p.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    driverPayments[index] = {
      ...driverPayments[index],
      ...req.body,
      id: id
    };
    
    res.json(driverPayments[index]);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(400).json({ error: 'Failed to update payment', message: error.message });
  }
});

// DELETE - Delete payment
router.delete('/drivers/:id', verifyAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const index = driverPayments.findIndex(p => p.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const deleted = driverPayments.splice(index, 1)[0];
    res.json({ message: 'Payment deleted successfully', payment: deleted });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(400).json({ error: 'Failed to delete payment', message: error.message });
  }
});

export default router;
