import express from 'express';
import City from '../models/city.js';

const router = express.Router();

// Get all cities
router.get('/', async (req, res) => {
  try {
    const { isActive, search } = req.query;
    
    let query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { state: { $regex: search, $options: 'i' } }
      ];
    }
    
    const cities = await City.find(query).sort({ name: 1 });
    res.json(cities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get city by ID
router.get('/:id', async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) return res.status(404).json({ error: 'City not found' });
    res.json(city);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new city
router.post('/', async (req, res) => {
  try {
    const { name, state, country, addresses, coordinates, isActive, image } = req.body;

    if (!name || !state) {
      return res.status(400).json({ error: 'Name and state are required' });
    }

    const existingCity = await City.findOne({ name: name.trim(), state: state.trim() });
    if (existingCity) return res.status(400).json({ error: 'City already exists in this state' });

    const city = new City({
      name: name.trim(),
      state: state.trim(),
      country: country || 'India',
      addresses: addresses || [],
      coordinates,
      isActive: isActive !== undefined ? isActive : true,
      image: image || ''
    });

    await city.save();
    res.status(201).json({ message: 'City added successfully', city });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'City already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Update city
router.put('/:id', async (req, res) => {
  try {
    const { name, state, country, addresses, coordinates, isActive, image } = req.body;

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (state) updateData.state = state.trim();
    if (country) updateData.country = country.trim();
    if (addresses !== undefined) updateData.addresses = addresses;
    if (coordinates) updateData.coordinates = coordinates;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (image !== undefined) updateData.image = image;

    const city = await City.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });

    if (!city) return res.status(404).json({ error: 'City not found' });

    res.json({ message: 'City updated successfully', city });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'City name already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Delete city (soft delete by default)
router.delete('/:id', async (req, res) => {
  try {
    const { permanent } = req.query;

    if (permanent === 'true') {
      const city = await City.findByIdAndDelete(req.params.id);
      if (!city) return res.status(404).json({ error: 'City not found' });
      res.json({ message: 'City permanently deleted', city });
    } else {
      const city = await City.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
      if (!city) return res.status(404).json({ error: 'City not found' });
      res.json({ message: 'City deactivated successfully', city });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate city
router.patch('/:id/activate', async (req, res) => {
  try {
    const city = await City.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!city) return res.status(404).json({ error: 'City not found' });
    res.json({ message: 'City activated successfully', city });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk add cities
router.post('/bulk', async (req, res) => {
  try {
    const { cities } = req.body;
    if (!Array.isArray(cities) || cities.length === 0) {
      return res.status(400).json({ error: 'Cities array is required' });
    }

    const results = await City.insertMany(cities, { ordered: false });
    res.status(201).json({ message: `${results.length} cities added successfully`, cities: results });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Some cities already exist', details: error.writeErrors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get cities statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const total = await City.countDocuments();
    const active = await City.countDocuments({ isActive: true });
    const inactive = await City.countDocuments({ isActive: false });
    const byState = await City.aggregate([
      { $group: { _id: '$state', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({ total, active, inactive, byState });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
