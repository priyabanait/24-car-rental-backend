import express from 'express';
import CarInvestmentEntry from '../models/carInvestmentEntry.js';

const router = express.Router();

// Create new car investment entry
router.post('/', async (req, res) => {
  try {
    const entry = new CarInvestmentEntry(req.body);
    await entry.save();
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all car investment entries
router.get('/', async (req, res) => {
  try {
    const entries = await CarInvestmentEntry.find();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Update car investment entry by ID
router.put('/:id', async (req, res) => {
  try {
    const updated = await CarInvestmentEntry.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Entry not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete car investment entry by ID
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await CarInvestmentEntry.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
