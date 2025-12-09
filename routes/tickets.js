import express from 'express';
import Ticket from '../models/ticket.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const total = await Ticket.countDocuments();
    const list = await Ticket.find()
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
    console.error('Error fetching tickets:', error);
    res.status(500).json({ message: 'Failed to fetch tickets', error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  const max = await Ticket.find().sort({ id: -1 }).limit(1).lean();
  const nextId = (max[0]?.id || 0) + 1;
  const newTicket = await Ticket.create({ id: nextId, ...req.body });
  res.status(201).json(newTicket);
});

export default router;
