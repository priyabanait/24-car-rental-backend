import express from 'express';
import DriverPlan from '../models/driverPlan.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

// List all plans
router.get('/', async (req, res) => {
  try {
    const list = await DriverPlan.find().lean();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load plans' });
  }
});

// Get single plan
router.get('/:id', async (req, res) => {
  try {
    const plan = await DriverPlan.findById(req.params.id).lean();
    if (!plan) return res.status(404).json({ message: 'Not found' });
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load plan' });
  }
});

// Create
router.post('/', authenticateToken, async (req, res) => {
  try {
    const p = new DriverPlan(req.body);
    await p.save();
    res.status(201).json(p);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Failed to create plan' });
  }
});

// Update
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const updated = await DriverPlan.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Failed to update plan' });
  }
});

// Delete
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const removed = await DriverPlan.findByIdAndDelete(req.params.id).lean();
    if (!removed) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Failed to delete plan' });
  }
});

export default router;
