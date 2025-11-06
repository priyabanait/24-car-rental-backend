import express from 'express';
import authRouter from './auth.js';
import driversRouter from './drivers.js';
import vehiclesRouter from './vehicles.js';
import investorsRouter from './investors.js';
import driverPlansRouter from './driverPlans.js';
import investmentPlansRouter from './investmentPlans.js';
import transactionsRouter from './transactions.js';
import ticketsRouter from './tickets.js';
import employeesRouter from './employees.js';
import dashboardRouter from './dashboard.js';
import carPlansRouter from './carPlans.js';

const router = express.Router();

router.use('/auth', authRouter);
router.use('/drivers', driversRouter);
router.use('/vehicles', vehiclesRouter);
router.use('/investors', investorsRouter);
router.use('/driver-plans', driverPlansRouter);
router.use('/investment-plans', investmentPlansRouter);
router.use('/transactions', transactionsRouter);
router.use('/tickets', ticketsRouter);
router.use('/employees', employeesRouter);
router.use('/dashboard', dashboardRouter);
router.use('/car-plans', carPlansRouter);

export default router;
