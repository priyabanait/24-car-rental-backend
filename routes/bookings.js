import express from 'express';
import Booking from '../models/booking.js';
import Vehicle from '../models/vehicle.js';
import DriverSignup from '../models/driverSignup.js';
import Notification from '../models/notification.js';
import FcmToken from '../models/fcmToken.js';
import { sendToTokens } from '../lib/firebaseAdmin.js';
import jwt from 'jsonwebtoken';

// Helper to send FCM to driver userIds
async function _sendFcmToUserIds(userIds, title, message, payload = {}) {
  if (!userIds || userIds.length === 0) return;
  const tokenDocs = await FcmToken.find({ userId: { $in: userIds }, userType: 'driver' }).lean();
  const tokens = tokenDocs.map(t => t.token).filter(Boolean);
  if (tokens.length === 0) return;
  try {
    const notification = { title: title || '', body: message || '' };
    await sendToTokens(tokens, notification, { payload: JSON.stringify(payload) }).catch(err => {
      console.error('Error sending multicast FCM:', err);
    });
  } catch (err) {
    console.error('Error sending FCM:', err);
  }
}

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  // Require a token for all modifying requests (including DELETE)
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. No token provided.' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.driverId = decoded.id || decoded._id;
    req.user = decoded; // Also set user for admin access
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token: ' + error.message 
    });
  }
};

// CREATE - Create a new booking
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      vehicleId,
      city,
      pickupLocation,
      dropoffLocation,
      tripStartDate,
      tripStartTime,
      tripEndDate,
      tripEndTime,
      bookingType,
      deliveryRequired,
      deliveryAddress,
      notes,
      paymentMethod,
      paymentStatus,
      status,
      numberOfDays,
      finalAmount
    } = req.body;

    // Validate required fields
    if (!vehicleId || !city || !pickupLocation || !tripStartDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: vehicleId, city, pickupLocation, tripStartDate'
      });
    }

    // Get driver details
    const driver = await DriverSignup.findById(req.driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Check if driver registration is completed
    if (!driver.registrationCompleted) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your registration before booking'
      });
    }

    // Get vehicle details
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // Check vehicle availability
    // Allow active, inactive, and suspended vehicles to be booked
    const allowedStatuses = ['active', 'inactive', 'suspended'];
    if (!allowedStatuses.includes(vehicle.status)) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle is not available for booking'
      });
    }

    // Prevent driver from creating another active booking
    const existingActiveBooking = await Booking.findOne({
      driverId: req.driverId,
      status: { $in: ['pending', 'confirmed', 'ongoing'] }
    });

    if (existingActiveBooking) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active booking. Please complete or cancel it before creating a new booking.',
        existingBooking: {
          id: existingActiveBooking._id,
          vehicleId: existingActiveBooking.vehicleId,
          vehicleName: existingActiveBooking.vehicleName,
          status: existingActiveBooking.status,
          tripStartDate: existingActiveBooking.tripStartDate,
          tripEndDate: existingActiveBooking.tripEndDate
        }
      });
    }

    // Calculate number of days
    const startDate = new Date(tripStartDate);
    const endDate = tripEndDate ? new Date(tripEndDate) : new Date(tripStartDate);

    // Check for existing bookings that conflict with the requested dates
    const conflictingBookings = await Booking.find({
      vehicleId,
      status: { $in: ['pending', 'confirmed', 'ongoing'] }, // Only check active bookings
      $or: [
        {
          // New booking starts during an existing booking
          tripStartDate: { $lte: startDate },
          tripEndDate: { $gte: startDate }
        },
        {
          // New booking ends during an existing booking
          tripStartDate: { $lte: endDate },
          tripEndDate: { $gte: endDate }
        },
        {
          // New booking completely contains an existing booking
          tripStartDate: { $gte: startDate },
          tripEndDate: { $lte: endDate }
        }
      ]
    });

    if (conflictingBookings.length > 0) {
      const existingBooking = conflictingBookings[0];
      return res.status(409).json({
        success: false,
        message: 'This vehicle is already booked for the selected dates',
        conflictDetails: {
          bookedFrom: existingBooking.tripStartDate,
          bookedUntil: existingBooking.tripEndDate,
          bookingStatus: existingBooking.status
        }
      });
    }
    const diffTime = Math.abs(endDate - startDate);
    const calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const calculatedHours = Math.ceil(diffTime / (1000 * 60 * 60)) || 1;

    // Calculate pricing based on booking type
    let pricePerDay = vehicle.pricePerDay || vehicle.dailyRate || 0;
    let pricePerHour = vehicle.pricePerHour || Math.ceil(pricePerDay / 24); // Default hourly = daily/24
    let totalAmount = 0;
    let calculatedDuration = calculatedDays;

    if (bookingType === 'hourly') {
      // For hourly bookings, calculate based on hours
      totalAmount = pricePerHour * calculatedHours;
      calculatedDuration = calculatedHours;
    } else {
      // For daily/weekly/monthly, calculate based on days
      totalAmount = pricePerDay * (numberOfDays || calculatedDays);
      calculatedDuration = numberOfDays || calculatedDays;
    }

    const securityDeposit = vehicle.securityDeposit || 0;
    const discount = 0; // Can be calculated based on offers/coupons
    const calculatedFinalAmount = finalAmount || (totalAmount + securityDeposit - discount);

    // Create booking
    const booking = new Booking({
      driverId: req.driverId,
      driverName: driver.name || driver.username,
      driverMobile: driver.mobile,
      driverEmail: driver.email,
      vehicleId,
      vehicleName: vehicle.carName || vehicle.name || `${vehicle.brand || vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''}`.trim() || 'Vehicle',
      vehicleModel: vehicle.model,
      vehicleNumber: vehicle.registrationNumber || vehicle.vehicleNumber,
      city,
      pickupLocation,
      dropoffLocation: dropoffLocation || pickupLocation,
      tripStartDate: startDate,
      tripStartTime: tripStartTime || null,
      tripEndDate: endDate,
      tripEndTime: tripEndTime || null,
      numberOfDays: calculatedDuration,
      pricePerDay,
      pricePerHour,
      totalAmount,
      securityDeposit,
      discount,
      finalAmount: calculatedFinalAmount,
      bookingType: bookingType || 'daily',
      deliveryRequired: deliveryRequired || false,
      deliveryAddress: deliveryAddress || '',
      notes: notes || '',
      status: status || 'pending',
      paymentStatus: paymentStatus || 'pending',
      paymentMethod: paymentMethod || 'cash',
      licenseVerified: driver.licenseDocument ? true : false,
      aadharVerified: driver.aadharDocument ? true : false,
      kycStatus: driver.kycStatus || 'pending'
    });

    try {
      await booking.save();
    } catch (e) {
      if (e && e.code === 11000 && e.keyPattern && e.keyPattern.driverId) {
        return res.status(409).json({
          success: false,
          message: 'You already have an active booking. Please complete or cancel it before creating a new booking.'
        });
      }
      throw e;
    }

    // Persist notification so it is available even if socket was missed
    try {
      const notif = await Notification.create({
        type: 'new_booking',
        title: 'New Booking',
        message: `${booking.driverName} created a booking for ${booking.vehicleName}.`,
        payload: { bookingId: booking._id, booking },
        read: false
      });
      console.info('Saved new booking notification:', notif._id || '(no id)');
    } catch (saveErr) {
      console.error('Failed to save new booking notification:', saveErr);
    }

    // Emit notification to dashboard clients (if socket server available)
    try {
      const io = req.app?.locals?.io;
      if (io) {
        io.to('dashboard').emit('dashboard_notification', {
          type: 'new_booking',
          title: 'New Booking',
          message: `${booking.driverName} created a booking for ${booking.vehicleName}.`,
          bookingId: booking._id,
          booking
        });
      }
    } catch (emitErr) {
      console.error('Failed to emit dashboard notification:', emitErr);
    }

    // Note: Vehicle status remains 'active' - we track bookings separately
    // Don't change vehicle status as 'booked' is not a valid enum value
    
    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking
    });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message
    });
  }
});

// READ - Get all bookings (no authentication required for admin panel)
router.get('/', async (req, res) => {
  try {
    const { status, bookingType, startDate, endDate, limit = 50, all } = req.query;
    
    // If 'all' query param is present, fetch all bookings (for admin)
    // Otherwise, filter by driverId if available
    const filter = all === 'true' ? {} : (req.driverId ? { driverId: req.driverId } : {});
    
    if (status) {
      // Support single status or comma-separated list
      if (typeof status === 'string' && status.includes(',')) {
        const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
        if (statuses.length > 0) filter.status = { $in: statuses };
      } else {
        filter.status = status;
      }
    }
    if (bookingType) filter.bookingType = bookingType;
    if (startDate || endDate) {
      filter.tripStartDate = {};
      if (startDate) filter.tripStartDate.$gte = new Date(startDate);
      if (endDate) filter.tripStartDate.$lte = new Date(endDate);
    }

    const bookings = await Booking.find(filter)
      .populate('vehicleId', 'name model make carFullPhoto status')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
});

// Get bookings by mobile number
router.get('/by-mobile/:mobile', async (req, res) => {
  try {
    const { mobile } = req.params;
    const { status, limit = 100 } = req.query;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }

    // Build filter
    const filter = { driverMobile: mobile };
    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .populate('vehicleId', 'carName model brand carFullPhoto status pricePerDay')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: bookings.length,
      mobile,
      bookings
    });

  } catch (error) {
    console.error('Get bookings by mobile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
});

// Check vehicle availability for specific dates
router.get('/check-availability/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date is required'
      });
    }

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(startDate);

    // Check for conflicting bookings
    const conflictingBookings = await Booking.find({
      vehicleId,
      status: { $in: ['pending', 'confirmed', 'ongoing'] },
      $or: [
        {
          tripStartDate: { $lte: start },
          tripEndDate: { $gte: start }
        },
        {
          tripStartDate: { $lte: end },
          tripEndDate: { $gte: end }
        },
        {
          tripStartDate: { $gte: start },
          tripEndDate: { $lte: end }
        }
      ]
    }).select('tripStartDate tripEndDate status driverName');

    const isAvailable = conflictingBookings.length === 0;

    res.json({
      success: true,
      available: isAvailable,
      requestedDates: {
        startDate: start,
        endDate: end
      },
      conflictingBookings: isAvailable ? [] : conflictingBookings
    });

  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability',
      error: error.message
    });
  }
});

// READ - Get single booking by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('vehicleId')
      .populate('driverId', 'name username mobile email');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking belongs to the driver
    if (booking.driverId._id.toString() !== req.driverId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      booking
    });

  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message
    });
  }
});

// UPDATE - Update booking status
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // If a driver token was provided, enforce ownership check.
    // If no token (req.driverId undefined), allow the delete to proceed (admin or other flows).
    if (req.driverId) {
      if (booking.driverId.toString() !== req.driverId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // Handle cancellation
    if (status === 'cancelled') {
      booking.status = 'cancelled';
      booking.cancellationReason = reason || 'Cancelled by driver';
      booking.cancelledBy = 'driver';
      booking.cancelledAt = new Date();

      // Update vehicle status back to available
      const vehicle = await Vehicle.findById(booking.vehicleId);
      if (vehicle) {
        vehicle.status = 'available';
        vehicle.currentBookingId = null;
        await vehicle.save();
      }
    } else {
      booking.status = status;
    }

    await booking.save();

    res.json({
      success: true,
      message: 'Booking status updated successfully',
      booking
    });

  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
      error: error.message
    });
  }
});

// UPDATE - Update payment status
router.patch('/:id/payment', async (req, res) => {
  try {
    const { paymentStatus, paymentMethod, transactionId, paidAmount, paymentType } = req.body;

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (paymentStatus) booking.paymentStatus = paymentStatus;
    if (paymentMethod) booking.paymentMethod = paymentMethod;
    if (transactionId) booking.transactionId = transactionId;
    
    // Handle payment with type-based deduction
    if (paidAmount !== undefined && paidAmount > 0) {
      const currentPaidAmount = booking.paidAmount || 0;
      const deposit = booking.securityDeposit || 0;
      const totalRent = (booking.numberOfDays || 0) * (booking.pricePerDay || 0);
      const adjustmentAmount = booking.adjustmentAmount || 0;
      let extraAmount = booking.extraAmount || 0;
      
      // Calculate current dues
      let totalPaid = currentPaidAmount;
      let depositDue = Math.max(0, deposit - Math.min(totalPaid, deposit));
      let rentPaid = Math.max(0, totalPaid - deposit);
      let rentDue = Math.max(0, totalRent - rentPaid - adjustmentAmount);
      
      // Update based on payment type
      const newPayment = Number(paidAmount);
      const type = paymentType || 'deposit';
      
      if (type === 'deposit') {
        // Deduct from deposit due
        depositDue = Math.max(0, depositDue - newPayment);
        totalPaid += newPayment;
      } else if (type === 'rent') {
        // Deduct from rent due
        rentDue = Math.max(0, rentDue - newPayment);
        totalPaid += newPayment;
      } else if (type === 'payable') {
        // Deduct from total - first deposit, then rent, then extra
        let remainingPayment = newPayment;
        if (depositDue > 0) {
          const depositPayment = Math.min(remainingPayment, depositDue);
          depositDue -= depositPayment;
          remainingPayment -= depositPayment;
        }
        if (remainingPayment > 0 && rentDue > 0) {
          const rentPayment = Math.min(remainingPayment, rentDue);
          rentDue -= rentPayment;
          remainingPayment -= rentPayment;
        }
        if (remainingPayment > 0 && extraAmount > 0) {
          const extraPayment = Math.min(remainingPayment, extraAmount);
          extraAmount -= extraPayment;
          booking.extraAmount = extraAmount; // Update extra amount in booking
          remainingPayment -= extraPayment;
        }
        totalPaid += newPayment;
      }
      
      booking.paidAmount = totalPaid;
      
      // Store payment type in booking for tracking
      if (!booking.paymentTypeHistory) booking.paymentTypeHistory = [];
      booking.paymentTypeHistory.push({
        amount: newPayment,
        type: type,
        date: new Date()
      });
    }

    // If payment completed, update booking status to confirmed
    if (paymentStatus === 'completed' && booking.status === 'pending') {
      booking.status = 'confirmed';
    }

    await booking.save();

    // If this payment completed the booking, notify the booking owner (driver)
    try {
      if (paymentStatus === 'completed') {
        // Persist notification for the user
        await Notification.create({
          userId: booking.driverId,
          userType: 'driver',
          type: 'payment_completed',
          title: 'Payment received',
          message: `Payment completed for booking ${booking._id}. Your booking is confirmed.`,
          payload: { bookingId: booking._id },
          read: false
        });

        // Emit socket event to user's room if available
        const io = req.app?.locals?.io;
        if (io) {
          io.to(`driver:${booking.driverId}`).emit('payment_completed', {
            bookingId: booking._id,
            title: 'Payment received',
            message: `Payment completed for booking ${booking._id}. Your booking is confirmed.`
          });
        }

        // Send FCM
        try {
          await _sendFcmToUserIds([booking.driverId], 'Payment received', `Payment completed for booking ${booking._id}. Your booking is confirmed.`, { bookingId: booking._id });
        } catch (err) {
          console.error('Failed to send FCM on payment completion:', err);
        }
      }
    } catch (notifErr) {
      console.error('Failed to send payment notifications:', notifErr);
    }

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      booking
    });

  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status',
      error: error.message
    });
  }
});

// PATCH - Update extra amount and reason (cumulative)
router.patch('/:id/extra', async (req, res) => {
  try {
    const { extraAmount, extraReason } = req.body;

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Add to existing amount instead of replacing
    if (extraAmount !== undefined && Number(extraAmount) > 0) {
      const amount = Number(extraAmount);
      booking.extraAmount = (booking.extraAmount || 0) + amount;
      
      // Add to extraAmounts array with date
      if (!booking.extraAmounts) booking.extraAmounts = [];
      booking.extraAmounts.push({
        amount: amount,
        reason: extraReason || 'Extra charge',
        date: new Date()
      });
    }
    
    // Update the main reason to show latest
    if (extraReason !== undefined) {
      const newReason = extraReason.trim();
      if (booking.extraReason && booking.extraReason.trim()) {
        booking.extraReason = `${booking.extraReason}; ${newReason}`;
      } else {
        booking.extraReason = newReason;
      }
    }

    await booking.save();

    res.json({
      success: true,
      message: 'Extra amount added successfully',
      booking
    });

  } catch (error) {
    console.error('Update extra amount error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update extra amount',
      error: error.message
    });
  }
});

// PATCH - Update adjustment amount and reason (cumulative)
router.patch('/:id/adjustment', async (req, res) => {
  try {
    const { adjustmentAmount, adjustmentReason } = req.body;

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Add to existing amount instead of replacing
    if (adjustmentAmount !== undefined && Number(adjustmentAmount) > 0) {
      const amount = Number(adjustmentAmount);
      booking.adjustmentAmount = (booking.adjustmentAmount || 0) + amount;
      
      // Add to adjustments array with date
      if (!booking.adjustments) booking.adjustments = [];
      booking.adjustments.push({
        amount: amount,
        reason: adjustmentReason || 'Adjustment',
        date: new Date()
      });
    }
    
    // Update the main reason to show latest
    if (adjustmentReason !== undefined) {
      const newReason = adjustmentReason.trim();
      if (booking.adjustmentReason && booking.adjustmentReason.trim()) {
        booking.adjustmentReason = `${booking.adjustmentReason}; ${newReason}`;
      } else {
        booking.adjustmentReason = newReason;
      }
    }

    await booking.save();

    res.json({
      success: true,
      message: 'Adjustment amount added successfully',
      booking
    });

  } catch (error) {
    console.error('Update adjustment amount error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update adjustment amount',
      error: error.message
    });
  }
});

// UPDATE - Add review and rating
router.patch('/:id/review', verifyToken, async (req, res) => {
  try {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid rating (1-5)'
      });
    }

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking belongs to the driver
    if (booking.driverId.toString() !== req.driverId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only allow review for completed bookings
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed bookings'
      });
    }

    booking.rating = rating;
    booking.review = review || '';
    booking.reviewedAt = new Date();

    await booking.save();

    res.json({
      success: true,
      message: 'Review submitted successfully',
      booking
    });

  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add review',
      error: error.message
    });
  }
});

// DELETE - Cancel booking (soft delete by updating status)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking belongs to the driver
    if (booking.driverId.toString() !== req.driverId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only allow cancellation for pending or confirmed bookings
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel this booking'
      });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Cancelled by driver';
    booking.cancelledBy = 'driver';
    booking.cancelledAt = new Date();

    await booking.save();

    // Add a driver payment record so admin payments UI can show cancellation
    try {
      const { addDriverPayment } = await import('../lib/driverPayments.js');
      await addDriverPayment({
        driverId: booking.driverId?.toString() || '',
        driverName: booking.driverName || '',
        phone: booking.driverMobile || '',
        paymentType: 'booking_cancellation',
        period: `Booking ${new Date(booking.tripStartDate).toISOString().split('T')[0]}`,
        amount: 0,
        commissionAmount: 0,
        commissionRate: 0,
        netPayment: 0,
        totalTrips: 0,
        totalDistance: 0,
        status: 'cancelled',
        paymentMethod: null,
        transactionId: null,
        paymentDate: new Date().toISOString().split('T')[0],
        bookingId: booking._id
      });
    } catch (e) {
      console.error('Failed to add driver payment record for cancellation:', e);
    }

    // Vehicle status remains 'active' - bookings are tracked separately
    // No need to update vehicle status

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message
    });
  }
});

// GET - Check vehicle availability for specific dates
router.post('/check-availability', async (req, res) => {
  try {
    const { vehicleId, tripStartDate, tripEndDate } = req.body;

    if (!vehicleId || !tripStartDate) {
      return res.status(400).json({
        success: false,
        message: 'vehicleId and tripStartDate are required'
      });
    }

    const startDate = new Date(tripStartDate);
    const endDate = tripEndDate ? new Date(tripEndDate) : new Date(tripStartDate);

    // Check if vehicle has any active bookings in the requested date range
    const conflictingBookings = await Booking.find({
      vehicleId,
      status: { $in: ['pending', 'confirmed', 'ongoing'] },
      $or: [
        {
          tripStartDate: { $lte: endDate },
          tripEndDate: { $gte: startDate }
        }
      ]
    });

    const isAvailable = conflictingBookings.length === 0;

    res.json({
      success: true,
      isAvailable,
      conflictingBookings: isAvailable ? [] : conflictingBookings
    });

  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check availability',
      error: error.message
    });
  }
});

// GET - Driver's booking statistics
router.get('/stats/summary', verifyToken, async (req, res) => {
  try {
    const driverId = req.driverId;

    const stats = await Booking.aggregate([
      { $match: { driverId: mongoose.Types.ObjectId(driverId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]);

    const totalBookings = await Booking.countDocuments({ driverId });
    const totalSpent = await Booking.aggregate([
      { $match: { driverId: mongoose.Types.ObjectId(driverId), paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } }
    ]);

    res.json({
      success: true,
      stats: {
        totalBookings,
        totalSpent: totalSpent[0]?.total || 0,
        byStatus: stats
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

export default router;
