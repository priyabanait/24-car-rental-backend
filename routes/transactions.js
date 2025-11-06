import express from 'express';
import Transaction from '../models/transaction.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const list = await Transaction.find().lean();
  res.json(list);
});

router.post('/', authenticateToken, async (req, res) => {
  const max = await Transaction.find().sort({ id: -1 }).limit(1).lean();
  const nextId = (max[0]?.id || 0) + 1;
  const body = req.body || {};
  const tx = await Transaction.create({ id: nextId, ...body });
  res.status(201).json(tx);
});

router.delete('/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  await Transaction.deleteOne({ id });
  res.json({ message: 'Deleted' });
});

export default router;
