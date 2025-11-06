import express from 'express';
import InvestmentPlan from '../models/investmentPlan.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const list = await InvestmentPlan.find().lean();
  res.json(list);
});

export default router;
