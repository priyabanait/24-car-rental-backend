import express from 'express';
import Manager from '../models/manager.js';
const router = express.Router();

// Create a new manager
router.post('/', async (req, res) => {
  try {
    const { username, password, name, email, mobile, address, city, pincode, salary, status, department, serviceCategory, dob } = req.body;
    // Store password as plain text (not recommended for production)
    const manager = new Manager({
      username,
      password,
      name,
      email,
      mobile,
      address,
      city,
      pincode,
      salary,
      status,
      department,
      serviceCategory,
      dob
    });
    await manager.save();
    res.status(201).json({ message: 'Manager created successfully', manager });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all managers
router.get('/', async (req, res) => {
  try {
    const managers = await Manager.find();
    res.json(managers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// (Optional) Get a single manager by ID
router.get('/:id', async (req, res) => {
  try {
    const manager = await Manager.findById(req.params.id);
    if (!manager) return res.status(404).json({ error: 'Manager not found' });
    res.json(manager);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// (Optional) Update a manager
router.put('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    // Store password as plain text (not recommended for production)
    const manager = await Manager.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!manager) return res.status(404).json({ error: 'Manager not found' });
    res.json(manager);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// (Optional) Delete a manager
router.delete('/:id', async (req, res) => {
  try {
    const manager = await Manager.findByIdAndDelete(req.params.id);
    if (!manager) return res.status(404).json({ error: 'Manager not found' });
    res.json({ message: 'Manager deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
