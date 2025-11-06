import express from 'express';
import Dashboard from '../models/dashboard.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const doc = await Dashboard.findOne().lean();
  res.json(doc || {});
});

export default router;
