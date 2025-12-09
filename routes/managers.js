
import express from 'express';
import Manager from '../models/manager.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
const router = express.Router();

const SECRET = process.env.JWT_SECRET || 'dev_secret';
// Manager login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const manager = await Manager.findOne({ email, password }).lean();
    if (!manager) return res.status(401).json({ message: 'Invalid credentials' });

    // Import permissions for fleet manager role
    const { ROLES } = await import('../../src/utils/permissions.js');
    const permissions = ROLES.FLEET_MANAGER.permissions;

    const payload = {
      id: manager._id,
      email: manager.email,
      name: manager.name,
      role: 'fleet_manager',
      permissions
    };
    const token = jwt.sign(payload, SECRET, { expiresIn: '8h' });
    res.json({ user: payload, token });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
});

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
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const total = await Manager.countDocuments();
    const managers = await Manager.find()
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);
    
    res.json({
      data: managers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
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
