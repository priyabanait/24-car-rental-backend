import express from 'express';
import CarInvestment from '../models/carInvestment.js';
const router = express.Router();

// GET all car investments
router.get('/', async (req, res) => {
  try {
    const carInvestments = await CarInvestment.find();
    res.json(carInvestments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create new car investment
router.post('/', async (req, res) => {
  try {
    const carInvestment = new CarInvestment(req.body);
    await carInvestment.save();
    res.status(201).json(carInvestment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update car investment
router.put('/:id', async (req, res) => {
  try {
    const updated = await CarInvestment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE car investment
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await CarInvestment.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
