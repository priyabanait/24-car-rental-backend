import express from 'express';
import CarInvestmentEntry from '../models/carInvestmentEntry.js';

const router = express.Router();

// Create new car investment entry
router.post('/', async (req, res) => {
  try {
    console.log('Creating car investment entry:', req.body);

    // ✅ FIX: remove empty investorId
    if (req.body.investorId === '') {
      delete req.body.investorId;
    }

    // ✅ Optional safety check
    if (
      req.body.investorId &&
      !mongoose.Types.ObjectId.isValid(req.body.investorId)
    ) {
      return res.status(400).json({ error: 'Invalid investorId' });
    }

    const entry = new CarInvestmentEntry(req.body);
    await entry.save();

    console.log('Car investment entry created:', entry);
    res.status(201).json(entry);
  } catch (err) {
    console.error('Error creating car investment entry:', err);
    res.status(400).json({ error: err.message });
  }
});

// Get all car investment entries
router.get('/', async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const total = await CarInvestmentEntry.countDocuments();
    const entries = await CarInvestmentEntry.find()
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);
    
    res.json({
      data: entries,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get car investment entry by ID
router.get('/:id', async (req, res) => {
  try {
    const entry = await CarInvestmentEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update car investment entry by ID
router.put('/:id', async (req, res) => {
  try {
    // ✅ sanitize empty investorId
    if (req.body.investorId === '') {
      delete req.body.investorId;
    }

    if (
      req.body.investorId &&
      !mongoose.Types.ObjectId.isValid(req.body.investorId)
    ) {
      return res.status(400).json({ error: 'Invalid investorId' });
    }

    const updated = await CarInvestmentEntry.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
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
    res.json({ message: 'Entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get investor totals - aggregate car investments by investor
router.get('/investor/totals', async (req, res) => {
  try {
    const entries = await CarInvestmentEntry.find();
    const totals = {};
    
    entries.forEach(entry => {
      if (entry.investorId) {
        const investorId = String(entry.investorId);
        if (!totals[investorId]) {
          totals[investorId] = {
            investorId,
            investorName: entry.carOwnerName,
            investorMobile: entry.investorMobile,
            totalPayout: 0,
            carCount: 0,
            cars: []
          };
        }
        totals[investorId].totalPayout += parseFloat(entry.finalMonthlyPayout || 0);
        totals[investorId].carCount += 1;
        totals[investorId].cars.push({
          carname: entry.carname,
          carOwnerName: entry.carOwnerName,
          carvalue: entry.carvalue,
          finalMonthlyPayout: entry.finalMonthlyPayout
        });
      }
    });
    
    res.json(Object.values(totals));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
