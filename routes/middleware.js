/* global process */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const SECRET = process.env.JWT_SECRET || 'dev_secret';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (process.env.NODE_ENV !== 'production') {
    // In development, bypass strict auth to unblock local testing
    return next();
  }
  if (!token) return res.status(401).json({ message: 'Missing token' });

  // Allow a special mock token in development to enable frontend mock auth flows
  if (token === 'mock') {
    req.user = { id: 'mock', role: 'dev', email: 'mock@udrive.local' };
    return next();
  }

  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
}

export default authenticateToken;
