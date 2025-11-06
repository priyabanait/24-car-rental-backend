import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/user.js';

dotenv.config();

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'dev_secret';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const found = await User.findOne({ email, password }).lean();
    if (!found) return res.status(401).json({ message: 'Invalid credentials' });

    const payload = { id: found.id, email: found.email, name: found.name, role: found.role };
    const token = jwt.sign(payload, SECRET, { expiresIn: '8h' });
    res.json({ user: payload, token });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
});

export default router;
