import express from 'express';
import axios from 'axios';

const router = express.Router();

// ZWITCH API configuration
const ZWITCH_API_URL = process.env.ZWITCH_API_URL || 'https://api.zwitch.io/v1';
const ZWITCH_API_KEY = process.env.ZWITCH_API_KEY;
const ZWITCH_API_SECRET = process.env.ZWITCH_API_SECRET;

// Middleware to verify authentication
const verifyAuth = (req, res, next) => {
  // Allow DELETE requests without token
  if (req.method === 'DELETE') return next();

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

import { driverPayments, getDriverPayments, addDriverPayment, updateDriverPayment } from '../lib/driverPayments.js';

// Note: `driverPayments` is now managed by `lib/driverPayments.js`. For production, persist this data in DB.

// GET all driver payments
router.get('/drivers', verifyAuth, async (req, res) => {
  try {
    const rows = await getDriverPayments();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching driver payments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch driver payments' });
  }
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
router.post('/drivers/create', verifyAuth, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      transactionId: req.body.transactionId || null,
      paymentDate: req.body.paymentDate || new Date().toISOString().split('T')[0]
    };
    const created = await addDriverPayment(payload);
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(400).json({ error: 'Failed to create payment', message: error.message });
  }
});

// PUT - Update payment
router.put('/drivers/:id', verifyAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await updateDriverPayment(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Payment not found' });
    res.json(updated);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(400).json({ error: 'Failed to update payment', message: error.message });
  }
});

// DELETE - Delete payment
router.delete('/drivers/:id', verifyAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await removeDriverPayment(id);
    if (!deleted) return res.status(404).json({ error: 'Payment not found' });
    res.json({ message: 'Payment deleted successfully', payment: deleted });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(400).json({ error: 'Failed to delete payment', message: error.message });
  }
});

export default router;
