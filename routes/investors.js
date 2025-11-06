import express from 'express';
import Investor from '../models/investor.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const list = await Investor.find().lean();
  res.json(list);
});

export default router;
