import express from 'express';
import Ticket from '../models/ticket.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const list = await Ticket.find().lean();
  res.json(list);
});

router.post('/', authenticateToken, async (req, res) => {
  const max = await Ticket.find().sort({ id: -1 }).limit(1).lean();
  const nextId = (max[0]?.id || 0) + 1;
  const newTicket = await Ticket.create({ id: nextId, ...req.body });
  res.status(201).json(newTicket);
});

export default router;
