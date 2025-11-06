import express from 'express';
import Employee from '../models/employee.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const list = await Employee.find().lean();
  res.json(list);
});

export default router;
