import express from 'express';
import DriverWalletMessage from '../models/driverWalletMessage.js';

const router = express.Router();

// POST: Send message to admin
router.post('/', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required.' });
    }
    const msg = new DriverWalletMessage({ phone, message });
    await msg.save();
    res.status(201).json(msg);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message', message: error.message });
  }
});

// GET: Get all messages (for admin)
router.get('/', async (req, res) => {
  try {
    const messages = await DriverWalletMessage.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages', message: error.message });
  }
});

export default router;
