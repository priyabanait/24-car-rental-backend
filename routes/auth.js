import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/user.js';
import DriverSignup from '../models/driverSignup.js';
import InvestorSignup from '../models/investorSignup.js';

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

// Forgot Password - Update password using mobile/phone number (Users, Drivers, Investors)
router.post('/forgot-password', async (req, res) => {
  try {
    const { mobile, phone, newPassword } = req.body;
    const identifier = (mobile || phone || '').toString().trim();

    // Validate input
    if (!identifier || !newPassword) {
      return res.status(400).json({ success: false, message: 'Mobile/phone number and new password required.' });
    }

    // Try Users collection (mobile)
    const user = await User.findOne({ mobile: identifier });
    if (user) {
      user.password = newPassword; // Note: plain text for now
      await user.save();
      return res.json({
        success: true,
        message: 'Password updated successfully.',
        user: {
          id: user._id,
          email: user.email,
          mobile: user.mobile,
          name: user.name
        }
      });
    }

    // Try Drivers (DriverSignup) collection
    const driver = await DriverSignup.findOne({ mobile: identifier });
    if (driver) {
      driver.password = newPassword;
      await driver.save();
      return res.json({
        success: true,
        message: 'Password updated successfully.',
        driver: {
          id: driver._id,
          username: driver.username,
          mobile: driver.mobile
        }
      });
    }

    // Try Investors (phone field)
    const investor = await InvestorSignup.findOne({ phone: identifier });
    if (investor) {
      investor.password = newPassword;
      await investor.save();
      return res.json({
        success: true,
        message: 'Password updated successfully.',
        investor: {
          id: investor._id,
          investorName: investor.investorName,
          email: investor.email,
          phone: investor.phone
        }
      });
    }

    return res.status(404).json({ success: false, message: 'User not found with this mobile/phone number.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: 'Server error during password reset.' });
  }
});

// Delete account - supports token-based auth (Bearer token) or credentials (email/mobile + password)
router.delete('/delete-account', async (req, res) => {
  try {
    // Try to extract token from Authorization header
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader);
    let userId = null;

    if (token) {
      try {
        const payload = jwt.verify(token, SECRET);
        userId = payload.id || payload._id;
      } catch (e) {
        // invalid token - will fall back to credential-based deletion
      }
    }

    // If token provided and valid, delete by id from the appropriate collection
    if (userId) {
      // If token has explicit type/role, prefer that to determine collection
      const payload = (() => {
        try {
          return jwt.verify(token, SECRET);
        } catch (e) {
          return {};
        }
      })();

      // Debug log to help diagnose 'user not found' cases
      console.log('Delete-account: token payload', payload);

      if (payload.type === 'driver' || payload.role === 'driver') {
        const deleted = await DriverSignup.findByIdAndDelete(userId);
        if (!deleted) return res.status(404).json({ success: false, message: 'Driver not found' });
        return res.json({ success: true, message: 'Driver account deleted successfully.' });
      }

      if (payload.type === 'investor' || payload.role === 'investor') {
        const deleted = await InvestorSignup.findByIdAndDelete(userId);
        if (!deleted) return res.status(404).json({ success: false, message: 'Investor not found' });
        return res.json({ success: true, message: 'Investor account deleted successfully.' });
      }

      // Default: try Users collection
      const deleted = await User.findByIdAndDelete(userId);
      if (!deleted) return res.status(404).json({ success: false, message: 'User not found' });

      return res.json({ success: true, message: 'Account deleted successfully. To use the service again, please create a new account.' });
    }

    // Otherwise require credentials in body
    const { email, mobile, password } = req.body;
    if (!password || (!email && !mobile)) {
      return res.status(400).json({ success: false, message: 'Provide password and email or mobile, or an auth token.' });
    }

    // Try Users collection first
    const userQuery = email ? { email, password } : { mobile, password };
    let found = await User.findOne(userQuery);
    if (found) {
      await User.findByIdAndDelete(found._id);
      return res.json({ success: true, message: 'Account deleted successfully. To use the service again, please create a new account.' });
    }

    // Try Drivers (mobile/username)
    const driverQuery = email ? { email, password } : { mobile: mobile, password };
    found = await DriverSignup.findOne(driverQuery);
    if (found) {
      await DriverSignup.findByIdAndDelete(found._id);
      return res.json({ success: true, message: 'Driver account deleted successfully.' });
    }

    // Try Investors (phone field)
    const investorQuery = email ? { email, password } : { phone: mobile, password };
    found = await InvestorSignup.findOne(investorQuery);
    if (found) {
      await InvestorSignup.findByIdAndDelete(found._id);
      return res.json({ success: true, message: 'Investor account deleted successfully.' });
    }

    return res.status(404).json({ success: false, message: 'User not found or invalid credentials' });
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ success: false, message: 'Account deletion failed' });
  }
});

export default router;
