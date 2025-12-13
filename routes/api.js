import driverWalletRouter from './driverWallet.js';

import driverWalletMessageRouter from './driverWalletMessage.js';

import express from 'express';
import authRouter from './auth.js';
import driversRouter from './drivers.js';
import driverAuthRouter from './driverAuth.js';
import driverPlanSelectionsRouter from './driverPlanSelections.js';
import vehiclesRouter from './vehicles.js';
import vehiclesByDriverRouter from './vehiclesByDriver.js';
import vehiclesByInvestorRouter from './vehiclesByInvestor.js';
import investorsRouter from './investors.js';
import investorWalletRouter from './investorWallet.js';
import investorWalletMessageRouter from './investorWalletMessage.js';
import driverPlansRouter from './driverPlans.js';
import investmentPlansRouter from './investmentPlans.js';
import transactionsRouter from './transactions.js';
import ticketsRouter from './tickets.js';
import employeesRouter from './employees.js';
import dashboardRouter from './dashboard.js';
import carPlansRouter from './carPlans.js';
import weeklyRentPlansRouter from './weeklyRentPlans.js';
import dailyRentPlansRouter from './dailyRentPlans.js';
import expensesRouter from './expenses.js';
import vehicleOptionsRouter from './vehicleOptions.js';
// Static routes commented out - now using database
// import staticInvestmentsRouter from './staticInvestments.js';
// import staticInvestmentPlansRouter from './staticInvestmentPlans.js';
import staticDriverEnrollmentsRouter from './staticDriverEnrollments.js';
import staticInvestmentsRouter from './staticInvestments.js';
// import staticVehicleRentSlabsRouter from './staticVehicleRentSlabs.js';
// import staticVehicleDailyRentSlabsRouter from './staticVehicleDailyRentSlabs.js';
import investmentFDsRouter from './investmentFDs.js';
import paymentsRouter from './payments.js';
// import carInvestmentsRouter from './carInvestments.js';
import carInvestmentEntriesRouter from './carInvestmentEntries.js';
import managersRouter from './managers.js';

const router = express.Router();
router.use('/driver-wallet', driverWalletRouter);
router.use('/driver-wallet-message', driverWalletMessageRouter);
router.use('/auth', authRouter);
router.use('/drivers', driversRouter);
router.use('/drivers', driverAuthRouter);
router.use('/driver-auth', driverAuthRouter);
router.use('/driver-plan-selections', driverPlanSelectionsRouter);
router.use('/vehicles', vehiclesRouter);
router.use('/vehicles-by-driver', vehiclesByDriverRouter);
router.use('/vehicles-by-investor', vehiclesByInvestorRouter);
router.use('/investors', investorsRouter);
router.use('/investor-wallet', investorWalletRouter);
router.use('/investor-wallet-message', investorWalletMessageRouter);
router.use('/driver-plans', driverPlansRouter);
router.use('/investment-plans', investmentPlansRouter);
router.use('/transactions', transactionsRouter);
router.use('/tickets', ticketsRouter);
router.use('/employees', employeesRouter);
router.use('/dashboard', dashboardRouter);
router.use('/car-plans', carPlansRouter);
router.use('/weekly-rent-plans', weeklyRentPlansRouter);
router.use('/daily-rent-plans', dailyRentPlansRouter);
router.use('/expenses', expensesRouter);
router.use('/vehicle-options', vehicleOptionsRouter);
// Static investment routes disabled - now using database routes above
// router.use('/static/investments', staticInvestmentsRouter);
// router.use('/static/investment-plans', staticInvestmentPlansRouter);
router.use('/static-investments', staticInvestmentsRouter);
router.use('/static/driver-enrollments', staticDriverEnrollmentsRouter);
// router.use('/static/vehicle-rent-slabs', staticVehicleRentSlabsRouter);
// router.use('/static/vehicle-daily-rent-slabs', staticVehicleDailyRentSlabsRouter);
router.use('/investment-fds', investmentFDsRouter);
router.use('/payments', paymentsRouter);
// router.use('/car-investments', carInvestmentsRouter);

// New car investment entries collection
router.use('/car-investment-entries', carInvestmentEntriesRouter);

// Manager routes
router.use('/managers', managersRouter);

export default router;
