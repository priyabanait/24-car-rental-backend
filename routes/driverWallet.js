import express from 'express';
import DriverWallet from '../models/driverWallet.js';

const router = express.Router();

// POST: Add wallet transaction (credit/debit)
router.post('/', async (req, res) => {
  try {
    const { phone, amount, description, type } = req.body;
    if (!phone || !amount || !type) {
      return res.status(400).json({ error: 'Phone, amount, and type are required.' });
    }
    let wallet = await DriverWallet.findOne({ phone });
    if (!wallet) {
      wallet = new DriverWallet({ phone, balance: 0, transactions: [] });
    }
    wallet.balance = type === 'credit' ? wallet.balance + amount : wallet.balance - amount;
    wallet.transactions.push({ amount, description, type });
    await wallet.save();
    res.status(201).json(wallet);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update wallet', message: error.message });
  }
});

// GET: Get wallet by phone number
router.get('/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const wallet = await DriverWallet.findOne({ phone });
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch wallet', message: error.message });
  }
});

export default router;
