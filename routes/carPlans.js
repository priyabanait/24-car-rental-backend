import express from 'express';
import CarPlan from '../models/carPlan.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

// List all car plans
router.get('/', async (req, res) => {
  try {
    const list = await CarPlan.find().lean();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load car plans' });
  }
});

// Get single car plan
router.get('/:id', async (req, res) => {
  try {
    const plan = await CarPlan.findById(req.params.id).lean();
    if (!plan) return res.status(404).json({ message: 'Not found' });
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load car plan' });
  }
});

// Create car plan
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('car-plans POST payload:', JSON.stringify(req.body).slice(0,1000));
    // normalize incoming payload so frontend PlanModal (which posts driver-plan shape)
    // can create a car plan without failing validation
    const payload = {
      name: req.body.name || req.body.title || 'Car Plan',
      vehicleType: req.body.vehicleType || req.body.category || (Array.isArray(req.body.vehicleTypes) ? req.body.vehicleTypes[0] : undefined) || 'General',
      securityDeposit: req.body.securityDeposit || req.body.deposit || 0,
      rows: Array.isArray(req.body.rows) ? req.body.rows : [],
      status: req.body.status || 'active',
      createdDate: req.body.createdDate || new Date().toISOString()
    };

    const p = new CarPlan(payload);
    await p.save();
    console.log('car-plan saved id=', p._id);
    res.status(201).json(p);
  } catch (err) {
    console.error('car-plans POST error:', err);
    res.status(400).json({ message: 'Failed to create car plan', error: err.message || String(err) });
  }
});

// Update car plan
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    // ensure some sensible defaults when updating from frontend modal
    const body = { ...req.body };
    if (!body.vehicleType) body.vehicleType = body.category || (Array.isArray(body.vehicleTypes) ? body.vehicleTypes[0] : undefined) || 'General';
    if (!Array.isArray(body.rows)) body.rows = body.rows || [];
    const updated = await CarPlan.findByIdAndUpdate(req.params.id, body, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Failed to update car plan' });
  }
});

// Delete car plan
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const removed = await CarPlan.findByIdAndDelete(req.params.id).lean();
    if (!removed) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Failed to delete car plan' });
  }
});

export default router;
