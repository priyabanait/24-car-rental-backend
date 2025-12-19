import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/user.js';

dotenv.config();

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'dev_secret';

// Login route - supports both email and mobile
router.post('/login', async (req, res) => {
  try {
    const { email, mobile, password } = req.body;
    
    // Find user by email or mobile
    const query = email ? { email, password } : { mobile, password };
    const found = await User.findOne(query).lean();
    
    if (!found) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    const payload = { 
      id: found._id, 
      email: found.email, 
      mobile: found.mobile,
      name: found.name, 
      role: found.role 
    };
    const token = jwt.sign(payload, SECRET, { expiresIn: '8h' });
    
    res.json({ 
      success: true,
      message: 'Login successful',
      data: {
        user: payload, 
        token 
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Login failed' 
    });
  }
});

// Signup route
router.post('/signup', async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email },
        { mobile: mobile }
      ]
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User with this email or mobile already exists' 
      });
    }
    
    // Create new user
    const newUser = new User({
      name,
      email: email || `${mobile}@temp.com`, // Temporary email if not provided
      mobile,
      password, // In production, this should be hashed
      role: 'customer'
    });
    
    await newUser.save();
    
    const payload = { 
      id: newUser._id, 
      email: newUser.email, 
      mobile: newUser.mobile,
      name: newUser.name, 
      role: newUser.role 
    };
    const token = jwt.sign(payload, SECRET, { expiresIn: '8h' });
    
    res.status(201).json({ 
      success: true,
      message: 'Account created successfully',
      data: {
        user: payload, 
        token 
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Signup failed',
      error: err.message 
    });
  }
});

export default router;
