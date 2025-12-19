import express from 'express';
import Booking from '../models/booking.js';
import Vehicle from '../models/vehicle.js';
import DriverSignup from '../models/driverSignup.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
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
      tripEndDate,
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

    // Calculate number of days
    const startDate = new Date(tripStartDate);
    const endDate = tripEndDate ? new Date(tripEndDate) : new Date(tripStartDate);
    const diffTime = Math.abs(endDate - startDate);
    const calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    // Calculate pricing (use provided values or calculate)
    const pricePerDay = vehicle.pricePerDay || vehicle.dailyRate || 0;
    const totalAmount = pricePerDay * (numberOfDays || calculatedDays);
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
      tripEndDate: endDate,
      numberOfDays: numberOfDays || calculatedDays,
      pricePerDay,
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

    await booking.save();

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
    
    if (status) filter.status = status;
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

    // Check if booking belongs to the driver
    if (booking.driverId.toString() !== req.driverId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
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
