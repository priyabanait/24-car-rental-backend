import express from 'express';
import Vehicle from '../models/vehicle.js';
import Booking from '../models/booking.js';
import Driver from '../models/driver.js';
import DriverSignup from '../models/driverSignup.js';
import DriverPlanSelection from '../models/driverPlanSelection.js';
import mongoose from 'mongoose';
import Notification from '../models/notification.js';
import FcmToken from '../models/fcmToken.js';
import { sendToTokens } from '../lib/firebaseAdmin.js';
// auth middleware not applied; token used only for login
import { uploadToCloudinary } from '../lib/cloudinary.js';

// Helper to send FCM to userIds (driver/investor)
async function _sendFcmToUserIds(userType, userIds, title, message, payload = {}) {
  if (!userIds || userIds.length === 0) return;
  const tokenDocs = await FcmToken.find({ userId: { $in: userIds }, userType }).lean();
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

// Remove any token/auth-related fields from incoming bodies
function stripAuthFields(source) {
  if (!source || typeof source !== 'object') return {};
  const disallowed = new Set(['token', 'authToken', 'accessToken', 'authorization', 'Authorization', 'bearer', 'Bearer']);
  const cleaned = {};
  for (const [k, v] of Object.entries(source)) {
    if (!disallowed.has(k)) cleaned[k] = v;
  }
  return cleaned;
}

function escapeRegex(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normalize vehicle object to always include expected keys so clients "see all data"
function normalizeVehicleShape(v) {
  const base = {
    // identity
    vehicleId: null,
    registrationNumber: '',

    // primary details
    category: '',
    brand: '',
    model: '',
    carName: '',
    color: '',
    fuelType: '',
    seatingCapacity: v?.seatingCapacity ?? 5,
    pricePerDay: v?.pricePerDay ?? 0,
    securityDeposit: v?.securityDeposit ?? 0,
    city: v?.city ?? '',
    location: v?.location ?? '',
    investorId: v?.investorId ?? null,
    ownerName: '',
    ownerPhone: '',
    year: null,
    manufactureYear: v?.manufactureYear ?? null,

    // dates and numbers
    registrationDate: '',
    rcExpiryDate: '',
    roadTaxDate: '',
    roadTaxNumber: '',
    insuranceDate: '',
    permitDate: '',
    emissionDate: '',
    pucNumber: '',
    trafficFine: v?.trafficFine ?? null,
    trafficFineDate: v?.trafficFineDate ?? '',

    // status
    status: v?.status ?? 'inactive',
    kycStatus: v?.kycStatus ?? 'pending',
    assignedDriver: '',
    remarks: v?.remarks ?? '',
    kycVerifiedDate: v?.kycVerifiedDate ?? null,

    // legacy docs
    insuranceDoc: null,
    rcDoc: null,
    permitDoc: null,
    pollutionDoc: null,
    fitnessDoc: null,

    // new photos
    registrationCardPhoto: null,
    roadTaxPhoto: null,
    pucPhoto: null,
    permitPhoto: null,
    carFrontPhoto: null,
    carLeftPhoto: null,
    carRightPhoto: null,
    carBackPhoto: null,
    carFullPhoto: null,

    // features
    features: v?.features ?? [],

    // misc
    make: v?.make ?? '',
    purchaseDate: v?.purchaseDate ?? '',
    purchasePrice: v?.purchasePrice ?? null,
    currentValue: v?.currentValue ?? null,
    mileage: v?.mileage ?? null,
    lastService: v?.lastService ?? '',
    nextService: v?.nextService ?? ''
  };

  // Merge existing doc over defaults
  return { ...base, ...(v || {}) };
}

// Get filter options - returns unique values for categories, fuel types, seating capacities
router.get('/filter-options', async (req, res) => {
  try {
    const { city, location, status = 'active', vehicleType } = req.query;

    // Build base filter for vehicles
    const filter = { };
    if (status) filter.status = status;

    if (city) {
      filter.city = new RegExp(`^${city.trim()}$`, 'i');
    }

    if (location) {
      filter.location = new RegExp(location.trim(), 'i');
    }

    if (vehicleType) {
      filter.vehicleType = new RegExp(`^${vehicleType.trim()}$`, 'i');
    }

    // Get all vehicles matching the base filter
    const vehicles = await Vehicle.find(filter).select('category fuelType seatingCapacity pricePerDay vehicleType').lean();

    // Extract unique values
    const categories = [...new Set(vehicles.map(v => v.category).filter(Boolean))].sort();
    const fuelTypes = [...new Set(vehicles.map(v => v.fuelType).filter(Boolean))].sort();
    const seatingCapacities = [...new Set(vehicles.map(v => v.seatingCapacity).filter(Boolean))].sort((a, b) => a - b);

    // Calculate price range
    const prices = vehicles.map(v => v.pricePerDay || 0).filter(p => p > 0);
    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0
    };

    res.json({
      success: true,
      data: {
        categories,
        fuelTypes,
        seatingCapacities,
        priceRange
      }
    });
  } catch (err) {
    console.error('Error fetching filter options:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch filter options',
      error: err.message 
    });
  }
});

// Search vehicles by city and location (optimized for frontend search)
router.get('/search/by-location', async (req, res) => {
  try {
    const {
      city,
      location,
      category,
      vehicleType,
      fuelType,
      seatingCapacity,
      minPrice,
      maxPrice,
      status = 'active',
      tripStart,
      tripStartTime,
      tripEnd,
      tripEndTime,
      bookingType = 'daily'
    } = req.query;

    const filter = {};

    // City filter (exact match, case-insensitive)
    if (city) filter.city = new RegExp(`^${city.trim()}$`, 'i');

    // Location filter (partial match, case-insensitive)
    if (location) filter.location = new RegExp(location.trim(), 'i');

    // Status filter
    if (status) filter.status = status;

    // Vehicle type filter
    if (vehicleType) filter.vehicleType = new RegExp(`^${vehicleType.trim()}$`, 'i');

    // Category filter
    if (category) filter.category = new RegExp(`^${category.trim()}$`, 'i');

    // Fuel type filter
    if (fuelType) filter.fuelType = new RegExp(`^${fuelType.trim()}$`, 'i');

    // Seating capacity filter
    if (seatingCapacity) filter.seatingCapacity = parseInt(seatingCapacity);

    // Price range filter
    if (minPrice || maxPrice) {
      filter.pricePerDay = {};
      if (minPrice) filter.pricePerDay.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerDay.$lte = Number(maxPrice);
    }

    // Fetch vehicles
    const vehicles = await Vehicle.find(filter)
      .select('-__v')
      .sort({ pricePerDay: 1, vehicleId: 1 })
      .lean();

    let availableVehicles = vehicles;

    if (tripStart) {
      // Parse start date and time
      let startDateTime = new Date(tripStart);
      if (tripStartTime) {
        const [hours, minutes] = tripStartTime.split(':');
        startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      }

      // Parse end date and time
      let endDateTime = tripEnd ? new Date(tripEnd) : new Date(tripStart);
      if (tripEndTime) {
        const [hours, minutes] = tripEndTime.split(':');
        endDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      } else if (!tripEnd && tripStartTime) {
        const [hours, minutes] = tripStartTime.split(':');
        endDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      }

      // Find conflicting bookings based on booking type
      let conflictingBookings;
      
      if (bookingType === 'hourly') {
        // For hourly bookings, check exact datetime overlaps
        conflictingBookings = await Booking.find({
          status: { $in: ['pending', 'confirmed', 'ongoing'] },
          $or: [
            { tripStartDate: { $lte: startDateTime }, tripEndDate: { $gte: startDateTime } },
            { tripStartDate: { $lte: endDateTime }, tripEndDate: { $gte: endDateTime } },
            { tripStartDate: { $gte: startDateTime }, tripEndDate: { $lte: endDateTime } }
          ]
        }).distinct('vehicleId');
      } else {
        // For daily/weekly/monthly, check at day-level (ignore time)
        const startDay = new Date(tripStart);
        startDay.setHours(0, 0, 0, 0);
        
        const endDay = tripEnd ? new Date(tripEnd) : new Date(tripStart);
        endDay.setHours(23, 59, 59, 999);

        conflictingBookings = await Booking.find({
          status: { $in: ['pending', 'confirmed', 'ongoing'] },
          tripStartDate: { $lte: endDay },
          tripEndDate: { $gte: startDay }
        }).distinct('vehicleId');
      }

      // Filter out booked vehicles
      availableVehicles = vehicles.filter(v => 
        !conflictingBookings.includes(v._id.toString())
      );
    }

    // Prepare response
    const response = {
      success: true,
      count: availableVehicles.length,
      filters: {
        city,
        location,
        category,
        vehicleType,
        fuelType,
        seatingCapacity,
        minPrice,
        maxPrice,
        status,
        tripStart,
        tripStartTime,
        tripEnd,
        tripEndTime,
        bookingType
      },
      data: availableVehicles.map(normalizeVehicleShape)
    };

    res.json(response);
  } catch (err) {
    console.error('Error searching vehicles by location:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to search vehicles',
      error: err.message
    });
  }
});


// Search/filter vehicles
router.get('/search', async (req, res) => {
  try {
    const {
      q, // general search query
      registrationNumber,
      brand,
      category,
      vehicleType,
      model,
      carName,
      color,
      fuelType,
      city,
      location,
      ownerName,
      ownerPhone,
      status,
      kycStatus,
      assignedDriver,
      assignedManager,
      minYear,
      maxYear
    } = req.query;

    const filter = {};

    // General search across multiple fields
    if (q && q.trim()) {
      const searchRegex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { registrationNumber: searchRegex },
        { brand: searchRegex },
        { category: searchRegex },
        { model: searchRegex },
        { carName: searchRegex },
        { city: searchRegex },
        { location: searchRegex },
        { ownerName: searchRegex },
        { ownerPhone: searchRegex },
        { assignedDriver: searchRegex }
      ];
    }

    // Specific field filters
    if (registrationNumber) filter.registrationNumber = new RegExp(registrationNumber, 'i');
    if (brand) filter.brand = new RegExp(brand, 'i');
    if (category) filter.category = new RegExp(category, 'i');
    if (vehicleType) filter.vehicleType = new RegExp(vehicleType, 'i');
    if (model) filter.model = new RegExp(model, 'i');
    if (carName) filter.carName = new RegExp(carName, 'i');
    if (color) filter.color = new RegExp(color, 'i');
    if (fuelType) filter.fuelType = new RegExp(fuelType, 'i');
    if (city) filter.city = new RegExp(city, 'i');
    if (location) filter.location = new RegExp(location, 'i');
    if (ownerName) filter.ownerName = new RegExp(ownerName, 'i');
    if (ownerPhone) filter.ownerPhone = new RegExp(ownerPhone, 'i');
    if (status) filter.status = status;
    if (kycStatus) filter.kycStatus = kycStatus;
    if (assignedDriver) filter.assignedDriver = new RegExp(assignedDriver, 'i');
    if (assignedManager) filter.assignedManager = new RegExp(assignedManager, 'i');

    // Year range filter
    if (minYear || maxYear) {
      filter.year = {};
      if (minYear) filter.year.$gte = Number(minYear);
      if (maxYear) filter.year.$lte = Number(maxYear);
    }

    const vehicles = await Vehicle.find(filter).lean();
    res.json(vehicles.map(normalizeVehicleShape));
  } catch (err) {
    console.error('Error searching vehicles:', err);
    res.status(500).json({ message: 'Failed to search vehicles' });
  }
});

// Get vehicles by investorId
router.get('/investor/:investorId', async (req, res) => {
  try {
    const { investorId } = req.params;
    const vehicles = await Vehicle.find({ investorId }).populate('investorId', 'investorName phone email').lean();
    res.json(vehicles.map(normalizeVehicleShape));
  } catch (err) {
    console.error('Error fetching vehicles for investor:', err);
    res.status(500).json({ message: 'Failed to fetch vehicles for investor' });
  }
});

// Get all vehicles
router.get('/', async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'vehicleId';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build filter from query params
    const filter = {};
    if (req.query.city) filter.city = new RegExp(req.query.city, 'i');
    if (req.query.status) filter.status = req.query.status;
    if (req.query.brand) filter.brand = new RegExp(req.query.brand, 'i');
    if (req.query.category) filter.category = new RegExp(req.query.category, 'i');
    if (req.query.vehicleType) filter.vehicleType = new RegExp(req.query.vehicleType, 'i');
    if (req.query.fuelType) filter.fuelType = new RegExp(req.query.fuelType, 'i');
    if (req.query.kycStatus) filter.kycStatus = req.query.kycStatus;

    const total = await Vehicle.countDocuments(filter);
    const list = await Vehicle.find(filter)
      .populate('investorId', 'investorName phone email')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Calculate months and cumulative payout for each vehicle
    const enhancedList = list.map(vehicle => {
      const normalized = normalizeVehicleShape(vehicle);
      const status = normalized.status || 'inactive';
      let calculatedMonths = 0;
      let cumulativePayout = 0;
      
      // Calculate months from rentPeriods if vehicle is active
      if (Array.isArray(normalized.rentPeriods) && normalized.rentPeriods.length > 0 && status === 'active') {
        normalized.rentPeriods.forEach(period => {
          const start = new Date(period.start);
          const end = period.end ? new Date(period.end) : new Date();
          const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
          calculatedMonths += Math.floor(diffDays / 30) + 1;
        });
      }
      
      // Calculate cumulative payout (monthlyProfitMin * months)
      const monthlyProfitMin = normalized.monthlyProfitMin || 0;
      cumulativePayout = monthlyProfitMin * calculatedMonths;
      
      return {
        ...normalized,
        calculatedMonths,
        cumulativePayout,
        isActive: status === 'active',
        hasRentPeriods: Array.isArray(normalized.rentPeriods) && normalized.rentPeriods.length > 0
      };
    });
    
    res.json({
      data: enhancedList,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (err) {
    console.error('Error fetching vehicles:', err);
    res.status(500).json({ message: 'Failed to fetch vehicles' });
  }
});

// Get a single vehicle by ID
router.get('/:id', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const vehicle = await Vehicle.findOne({ vehicleId }).populate('investorId', 'investorName phone email').lean();
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    res.json(normalizeVehicleShape(vehicle));
  } catch (err) {
    console.error('Error fetching vehicle:', err);
    res.status(500).json({ message: 'Failed to fetch vehicle' });
  }
});

// Create a new vehicle
router.post('/', async (req, res) => {
  try {
    if (!req.body.registrationNumber) {
      return res.status(400).json({ message: 'Registration number is required' });
    }

    const body = stripAuthFields(req.body);
    let vehicleData = {
      status: 'inactive',
      kycStatus: 'pending',
      ...body
    };

    // Normalize and coerce basic types
    vehicleData.registrationNumber = (vehicleData.registrationNumber || '').toString().trim();
    if (vehicleData.year != null) vehicleData.year = Number(vehicleData.year);
    if (vehicleData.trafficFine != null) vehicleData.trafficFine = Number(vehicleData.trafficFine);
    
    // Handle investorId - convert to ObjectId if provided
    if (vehicleData.investorId) {
      const mongoose = await import('mongoose');
      if (mongoose.default.Types.ObjectId.isValid(vehicleData.investorId)) {
        vehicleData.investorId = new mongoose.default.Types.ObjectId(vehicleData.investorId);
      } else {
        delete vehicleData.investorId; // Invalid ObjectId, remove it
      }
    }

    // Normalize category and carCategory to match investment entry carnames
    try {
      const CarInvestmentEntry = (await import('../models/carInvestmentEntry.js')).default;
      const entries = await CarInvestmentEntry.find();
      const entryNames = entries.map(e => (e.carname || '').trim().toLowerCase());
      let cat = (vehicleData.category || '').trim().toLowerCase();
      let carCat = (vehicleData.carCategory || '').trim().toLowerCase();
      let match = entryNames.find(name => name === cat) || entryNames.find(name => name === carCat);
      if (!match) {
        // Try to auto-correct using closest match (startsWith)
        let suggestion = entryNames.find(name => cat && name.startsWith(cat.slice(0, 3))) || entryNames.find(name => carCat && name.startsWith(carCat.slice(0, 3)));
        if (suggestion) {
          if (cat && !entryNames.includes(cat)) vehicleData.category = suggestion;
          if (carCat && !entryNames.includes(carCat)) vehicleData.carCategory = suggestion;
        }
      }
    } catch (err) {
      console.error('Error normalizing category:', err);
    }

    // Calculate monthlyProfitMin from car investment entry by matching category with carname
    try {
      const CarInvestmentEntry = (await import('../models/carInvestmentEntry.js')).default;
      const category = (vehicleData.category || vehicleData.carCategory || '').trim().toLowerCase();
      
      // Find matching car investment entry by carname (not by name field)
      let matchedInvestment = await CarInvestmentEntry.findOne({ 
        carname: new RegExp(`^${category}$`, 'i') 
      });
      
      // If investorId is provided, try to find investor-specific entry first
      if (vehicleData.investorId) {
        const investorSpecificEntry = await CarInvestmentEntry.findOne({
          carname: new RegExp(`^${category}$`, 'i'),
          investorId: vehicleData.investorId
        });
        if (investorSpecificEntry) {
          matchedInvestment = investorSpecificEntry;
        }
      }
      
      if (matchedInvestment) {
        vehicleData.monthlyProfitMin = parseFloat(matchedInvestment.finalMonthlyPayout || matchedInvestment.MonthlyPayout || 0);
      }
    } catch (err) {
      console.error('Error calculating monthlyProfitMin:', err);
    }

    const documentFields = ['insuranceDoc', 'rcDoc', 'permitDoc', 'pollutionDoc', 'fitnessDoc'];
    // Newly supported photo fields from UI
    const photoFields = [
      'registrationCardPhoto',
      'roadTaxPhoto',
      'pucPhoto',
      'permitPhoto',
      'carFrontPhoto',
      'carLeftPhoto',
      'carRightPhoto',
      'carBackPhoto',
      'carFullPhoto'
    ];
    const uploadedDocs = {};

    // Upload documents if provided as base64
    for (const field of documentFields) {
      if (vehicleData[field] && vehicleData[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(
            vehicleData[field],
            `vehicles/${vehicleData.registrationNumber}/${field}`
          );
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
        // prevent saving raw base64 if present
        delete vehicleData[field];
      }
    }

    // Upload new photo fields if provided as base64
    for (const field of photoFields) {
      if (vehicleData[field] && typeof vehicleData[field] === 'string' && vehicleData[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(
            vehicleData[field],
            `vehicles/${vehicleData.registrationNumber}/${field}`
          );
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
        // prevent saving raw base64 if present
        delete vehicleData[field];
      }
    }

    // Generate next vehicleId
    const latestVehicle = await Vehicle.findOne({}).sort({ vehicleId: -1 });
    const nextVehicleId = (latestVehicle?.vehicleId || 0) + 1;

    const vehicle = new Vehicle({
      ...vehicleData,
      ...uploadedDocs,
      vehicleId: nextVehicleId
    });

    const savedVehicle = await vehicle.save();
    res.status(201).json(savedVehicle);
  } catch (err) {
    console.error('Error creating vehicle:', err);
    if (err && (err.code === 11000 || err.code === '11000')) {
      return res.status(409).json({ message: 'Duplicate registration number' });
    }
    res.status(500).json({ message: err?.message || 'Failed to create vehicle' });
  }
});

// Update a vehicle
router.put('/:id', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const updates = stripAuthFields(req.body);

    // Normalize/coerce
    if (updates.registrationNumber) updates.registrationNumber = String(updates.registrationNumber).trim();
    if (updates.year != null) updates.year = Number(updates.year);
    if (updates.trafficFine != null) updates.trafficFine = Number(updates.trafficFine);
    
    // Handle investorId - convert to ObjectId if provided
    if (updates.investorId) {
      const mongoose = await import('mongoose');
      if (mongoose.default.Types.ObjectId.isValid(updates.investorId)) {
        updates.investorId = new mongoose.default.Types.ObjectId(updates.investorId);
      } else {
        delete updates.investorId; // Invalid ObjectId, remove it
      }
    }

    // Normalize category and carCategory to match investment entry carnames
    try {
      const CarInvestmentEntry = (await import('../models/carInvestmentEntry.js')).default;
      const entries = await CarInvestmentEntry.find();
      const entryNames = entries.map(e => (e.carname || '').trim().toLowerCase());
      let cat = (updates.category || '').trim().toLowerCase();
      let carCat = (updates.carCategory || '').trim().toLowerCase();
      let match = entryNames.find(name => name === cat) || entryNames.find(name => name === carCat);
      if (!match) {
        // Try to auto-correct using closest match (startsWith)
        let suggestion = entryNames.find(name => cat && name.startsWith(cat.slice(0, 3))) || entryNames.find(name => carCat && name.startsWith(carCat.slice(0, 3)));
        if (suggestion) {
          if (cat && !entryNames.includes(cat)) updates.category = suggestion;
          if (carCat && !entryNames.includes(carCat)) updates.carCategory = suggestion;
        }
      }
    } catch (err) {
      console.error('Error normalizing category:', err);
    }

    // Calculate monthlyProfitMin from car investment entry on update
    try {
      const CarInvestmentEntry = (await import('../models/carInvestmentEntry.js')).default;
      const existing = await Vehicle.findOne({ vehicleId });
      const category = (updates.category || updates.carCategory || existing?.category || existing?.carCategory || '').trim().toLowerCase();
      
      // Find matching car investment entry by carname
      let matchedInvestment = await CarInvestmentEntry.findOne({ 
        carname: new RegExp(`^${category}$`, 'i') 
      });
      
      // If investorId is provided or exists, try to find investor-specific entry first
      const investorId = updates.investorId || existing?.investorId;
      if (investorId) {
        const investorSpecificEntry = await CarInvestmentEntry.findOne({
          carname: new RegExp(`^${category}$`, 'i'),
          investorId: investorId
        });
        if (investorSpecificEntry) {
          matchedInvestment = investorSpecificEntry;
        }
      }
      
      if (matchedInvestment) {
        updates.monthlyProfitMin = parseFloat(matchedInvestment.finalMonthlyPayout || matchedInvestment.MonthlyPayout || 0);
      }
    } catch (err) {
      console.error('Error calculating monthlyProfitMin:', err);
    }

    const documentFields = ['insuranceDoc', 'rcDoc', 'permitDoc', 'pollutionDoc', 'fitnessDoc'];
    const photoFields = [
      'registrationCardPhoto',
      'roadTaxPhoto',
      'pucPhoto',
      'permitPhoto',
      'carFrontPhoto',
      'carLeftPhoto',
      'carRightPhoto',
      'carBackPhoto',
      'carFullPhoto'
    ];
    const uploadedDocs = {};

    // Upload new documents if base64 data is sent
    for (const field of documentFields) {
      if (updates[field] && updates[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(updates[field], `vehicles/${vehicleId}/${field}`);
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
        delete updates[field];
      }
    }

    // Upload new photo fields if base64 data is sent
    for (const field of photoFields) {
      if (updates[field] && typeof updates[field] === 'string' && updates[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(updates[field], `vehicles/${vehicleId}/${field}`);
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
        delete updates[field];
      }
    }

    let existing = await Vehicle.findOne({ vehicleId });
    // Track rent periods for each status change
    if (!existing.rentPeriods) existing.rentPeriods = [];
    // If status is being set to active
    if (updates.status === 'active') {
      // Clear any previous periods and start fresh
      existing.rentPeriods = [{ start: new Date(), end: null }];
      updates.rentPeriods = existing.rentPeriods;
      updates.rentStartDate = new Date();
      updates.rentPausedDate = null;
    }
    // If status is being set to inactive, clear all rent periods
    if (updates.status === 'inactive' || updates.status === 'suspended') {
      updates.rentPeriods = [];
      updates.rentPausedDate = new Date();
      updates.rentStartDate = null;
    }

    // KYC status activation logic
    if (updates.kycStatus === 'active' && (!existing || !existing.kycActivatedDate)) {
      updates.kycActivatedDate = new Date();
    }
    // If KYC status is set to inactive, clear kycActivatedDate
    if (updates.kycStatus === 'inactive') {
      updates.kycActivatedDate = null;
    }

      // KYC verified logic
      if (updates.kycStatus === 'active' && (!existing || !existing.kycVerifiedDate)) {
        updates.kycVerifiedDate = new Date();
      }
      if (updates.kycStatus === 'inactive') {
        updates.kycVerifiedDate = null;
      }

    // Calculate total active months from rentPeriods
    let activeMonths = 0;
    let monthlyProfitMin = (typeof updates !== 'undefined' && updates.monthlyProfitMin !== undefined)
      ? updates.monthlyProfitMin
      : (existing.monthlyProfitMin || 0);
    if (Array.isArray(existing.rentPeriods)) {
      existing.rentPeriods.forEach(period => {
        const start = new Date(period.start);
        const end = period.end ? new Date(period.end) : new Date();
        const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
        activeMonths += Math.floor(diffDays / 30) + 1;
      });
    }
    updates.totalProfit = monthlyProfitMin * activeMonths;

    const vehicle = await Vehicle.findOneAndUpdate(
      { vehicleId },
      { ...updates, ...uploadedDocs },
      { new: true }
    ).lean();

    // If the vehicle is active and has an assigned driver, ensure any matching
    // driver plan selections that have not yet started rent (rentStartDate === null)
    // are updated to start now. This ensures rent counting starts only after
    // driver assignment + vehicle active state.
    try {
      const assigned = vehicle?.assignedDriver;
      const becameActive = vehicle && vehicle.status === 'active';
      const becameInactive = vehicle && (vehicle.status === 'inactive' || vehicle.status === 'suspended');

      if (assigned && (becameActive || becameInactive)) {
        const orClauses = [];

        // If assigned looks like an ObjectId, try DriverSignup (preferred) then Driver
        if (mongoose.Types.ObjectId.isValid(assigned)) {
          try {
            const signup = await DriverSignup.findById(assigned).lean();
            if (signup) {
              // Match by signup id, mobile, username and name (escape values for safe regex)
              orClauses.push({ driverSignupId: signup._id });
              const _sMobile = signup.mobile ? escapeRegex(String(signup.mobile)) : null;
              const _sUsername = signup.username ? escapeRegex(String(signup.username)) : null;
              const _sName = signup.name ? escapeRegex(String(signup.name)) : null;
              if (_sMobile) orClauses.push({ driverMobile: new RegExp(`^${_sMobile}$`, 'i') });
              if (_sUsername) orClauses.push({ driverUsername: new RegExp(`^${_sUsername}$`, 'i') });
              if (_sName) orClauses.push({ driverName: new RegExp(`^${_sName}$`, 'i') });
            } else {
              // Fallback to Driver collection
              try {
                const drv = await Driver.findById(assigned).lean();
                if (drv) {
                  const _dMobile = drv.mobile ? escapeRegex(String(drv.mobile)) : null;
                  const _dUsername = drv.username ? escapeRegex(String(drv.username)) : null;
                  const _dName = drv.name ? escapeRegex(String(drv.name)) : null;
                  if (_dMobile) orClauses.push({ driverMobile: new RegExp(`^${_dMobile}$`, 'i') });
                  if (_dUsername) orClauses.push({ driverUsername: new RegExp(`^${_dUsername}$`, 'i') });
                  if (_dName) orClauses.push({ driverName: new RegExp(`^${_dName}$`, 'i') });

                  // Also try to resolve a corresponding DriverSignup so we can match bookings by driverId
                  try {
                    const signupQuery = { $or: [] };
                    if (drv.mobile) signupQuery.$or.push({ mobile: new RegExp(`^${escapeRegex(String(drv.mobile))}$`, 'i') });
                    if (drv.username) signupQuery.$or.push({ username: new RegExp(`^${escapeRegex(String(drv.username))}$`, 'i') });
                    if (drv.name) signupQuery.$or.push({ name: new RegExp(`^${escapeRegex(String(drv.name))}$`, 'i') });
                    if (signupQuery.$or.length > 0) {
                      const sMatch = await DriverSignup.findOne(signupQuery).lean();
                      if (sMatch) {
                        orClauses.push({ driverSignupId: sMatch._id });
                        // This will allow booking query translation to include driverId
                      }
                    }
                  } catch (e) {
                    console.error('Error finding DriverSignup for Driver fallback lookup:', e);
                  }
                }
              } catch (e) {
                console.error('Driver lookup failed for assignedDriver id (fallback):', e);
              }

              // Also include raw assigned id as a possible signup/objectId match
              try {
                orClauses.push({ driverSignupId: new mongoose.Types.ObjectId(assigned) });
              } catch (e) {
                // ignore invalid cast
              }
            }
          } catch (e) {
            console.error('Error while checking DriverSignup by assigned id:', e);
          }
        } else {
          // assigned is a plain string - decide if it's mobile (numeric) or username
          if (/^\d+$/.test(String(assigned))) {
            const _assignEsc = escapeRegex(String(assigned));
            orClauses.push({ driverMobile: new RegExp(`^${_assignEsc}$`, 'i') });
          } else {
            const _assignEsc = escapeRegex(String(assigned));
            orClauses.push({ driverUsername: new RegExp(`^${_assignEsc}$`, 'i') });
          }

          // Also try to find corresponding DriverSignup for the string to match driverSignupId
          try {
            const signupQuery = { $or: [] };
            const _assignEsc2 = escapeRegex(String(assigned));
            signupQuery.$or.push({ mobile: new RegExp(`^${_assignEsc2}$`, 'i') });
            signupQuery.$or.push({ username: new RegExp(`^${_assignEsc2}$`, 'i') });
            signupQuery.$or.push({ name: new RegExp(`^${_assignEsc2}$`, 'i') });
            const signup = await DriverSignup.findOne(signupQuery).lean();
            if (signup) {
              orClauses.push({ driverSignupId: signup._id });
              const _sName3 = signup.name ? escapeRegex(String(signup.name)) : null;
              if (_sName3) orClauses.push({ driverName: new RegExp(`^${_sName3}$`, 'i') });
            }
          } catch (e) {
            console.error('Error finding DriverSignup for assigned driver string:', e);
          }
        }

        if (orClauses.length > 0) {
          if (becameActive) {
            // Start rent for matching plan selections that haven't started
            const query = { rentStartDate: null, status: 'active', $or: orClauses };
            try {
              console.log('Attempting to start rent with query:', JSON.stringify(query));

              // Debug: log counts per clause to see why nothing matches
              for (const clause of orClauses) {
                try {
                  const cQuery = { rentStartDate: null, status: 'active', ...clause };
                  const count = await DriverPlanSelection.countDocuments(cQuery);
                  console.log('Clause:', JSON.stringify(clause), 'matches:', count);
                } catch (e) {
                  console.error('Error counting clause matches:', clause, e);
                }
              }

              // Additionally, notify any confirmed bookings for this vehicle that it has been assigned
              try {
                const confirmedBookings = await Booking.find({ vehicleId: vehicle._id, status: 'confirmed' }).lean();
                if (confirmedBookings && confirmedBookings.length > 0) {
                  const userIds = confirmedBookings.map(b => b.driverId).filter(Boolean);

                  // Create notifications in DB for each booking owner
                  const notifs = confirmedBookings.map(b => ({
                    userId: b.driverId,
                    userType: 'driver',
                    type: 'vehicle_assigned',
                    title: 'Vehicle Assigned',
                    message: `Your vehicle ${vehicle.carName || vehicle.name || ''} has been assigned.`,
                    payload: { bookingId: b._id, vehicleId: vehicle._id },
                    read: false
                  }));

                  try {
                    await Notification.insertMany(notifs);
                  } catch (e) {
                    console.error('Failed to insert vehicle assigned notifications:', e);
                  }

                  // Emit socket events
                  const io = req.app?.locals?.io;
                  if (io) {
                    confirmedBookings.forEach(b => {
                      io.to(`driver:${b.driverId}`).emit('vehicle_assigned', {
                        bookingId: b._id,
                        vehicleId: vehicle._id,
                        title: 'Vehicle Assigned',
                        message: `Your vehicle ${vehicle.carName || vehicle.name || ''} has been assigned.`
                      });
                    });
                  }

                  // Send FCM to drivers
                  try {
                    await _sendFcmToUserIds('driver', userIds, 'Vehicle Assigned', `Your vehicle ${vehicle.carName || vehicle.name || ''} has been assigned.`, { vehicleId: vehicle._id });
                  } catch (e) {
                    console.error('Failed to send FCM for vehicle assignment:', e);
                  }
                }
              } catch (e) {
                console.error('Error while notifying confirmed bookings on vehicle assignment:', e);
              }

              const totalMatches = await DriverPlanSelection.countDocuments(query);
              console.log('Total matches for combined query:', totalMatches);

              const result = await DriverPlanSelection.updateMany(query, { $set: { rentStartDate: new Date() } });
              console.log(`Started rent for ${result.modifiedCount} plan selections for assigned driver ${vehicle.assignedDriver}`);

              // Also try to start rent for matching bookings tied to this vehicle
              try {
                const bookingQuery = { vehicleId: vehicle._id, rentStartDate: null, status: { $in: ['confirmed','ongoing','pending'] }, $or: [] };
                // Translate the orClauses into booking match clauses
                for (const c of orClauses) {
                  if (c.driverSignupId) bookingQuery.$or.push({ driverId: c.driverSignupId });
                  if (c.driverMobile) bookingQuery.$or.push({ driverMobile: c.driverMobile });
                  if (c.driverUsername) bookingQuery.$or.push({ driverName: c.driverUsername });
                  if (c.driverName) bookingQuery.$or.push({ driverName: c.driverName });
                  for (const clause of bookingQuery.$or) {
                    try {
                      const cQ = { vehicleId: vehicle._id, rentStartDate: null, status: { $in: ['confirmed','ongoing','pending'] }, ...clause };
                      const count = await Booking.countDocuments(cQ);
                      console.log('Booking Clause:', JSON.stringify(clause), 'matches:', count);
                    } catch (e) {
                      console.error('Error counting bookings clause:', clause, e);
                    }
                  }
                  const totalBookingMatches = await Booking.countDocuments(bookingQuery);
                  console.log('Total booking matches for combined query:', totalBookingMatches);
                  const bookingResult = await Booking.updateMany(bookingQuery, { $set: { rentStartDate: new Date() } });
                  console.log(`Started rent (bookings) for ${bookingResult.modifiedCount} booking(s) for vehicle ${vehicle.vehicleId || vehicle._id}`);

                  // Verify updated bookings and log their rentStartDate values for debugging
                  try {
                    const updatedBookings = await Booking.find({ vehicleId: vehicle._id, rentStartDate: { $ne: null } }).limit(20).lean();
                    console.log('Updated bookings with rentStartDate (sample):', updatedBookings.map(b => ({ id: b._id, rentStartDate: b.rentStartDate })));
                  } catch (e) {
                    console.error('Failed to fetch updated bookings for verification:', e);
                  }
                }
              } catch (e) {
                console.error('Failed to set rentStartDate on Bookings:', e);
              }

            } catch (e) {
              console.error('Failed to set rentStartDate on DriverPlanSelection:', e);
            }
          } else if (becameInactive) {
            // Stop rent by clearing rentStartDate (will cause rent calc to stop)
            const query = { rentStartDate: { $ne: null }, status: 'active', $or: orClauses };
            try {
              console.log('Attempting to clear rentStartDate with query:', JSON.stringify(query));

              // Debug: log counts per clause to help diagnose
              for (const clause of orClauses) {
                try {
                  const cQuery = { rentStartDate: { $ne: null }, status: 'active', ...clause };
                  const count = await DriverPlanSelection.countDocuments(cQuery);
                  console.log('Clear Clause:', JSON.stringify(clause), 'matches:', count);
                } catch (e) {
                  console.error('Error counting clear-clause matches:', clause, e);
                }
              }

              const totalMatches = await DriverPlanSelection.countDocuments(query);
              console.log('Total matches for combined clear query:', totalMatches);

              const result = await DriverPlanSelection.updateMany(query, { $set: { rentStartDate: null } });
              console.log(`Cleared rentStartDate for ${result.modifiedCount} plan selections due to vehicle inactivity for assigned driver ${vehicle.assignedDriver}`);

              // Also clear rentStartDate on matching bookings for this vehicle
              try {
                const bookingQuery = { vehicleId: vehicle._id, rentStartDate: { $ne: null }, status: { $in: ['confirmed','ongoing','pending'] }, $or: [] };
                for (const c of orClauses) {
                  if (c.driverSignupId) bookingQuery.$or.push({ driverId: c.driverSignupId });
                  if (c.driverMobile) bookingQuery.$or.push({ driverMobile: c.driverMobile });
                  if (c.driverUsername) bookingQuery.$or.push({ driverName: c.driverUsername });
                  if (c.driverName) bookingQuery.$or.push({ driverName: c.driverName });
                }
                if (bookingQuery.$or.length > 0) {
                  console.log('Attempting to clear rentStartDate on bookings with query:', JSON.stringify(bookingQuery));
                  for (const clause of bookingQuery.$or) {
                    try {
                      const cQ = { vehicleId: vehicle._id, rentStartDate: { $ne: null }, status: { $in: ['confirmed','ongoing','pending'] }, ...clause };
                      const count = await Booking.countDocuments(cQ);
                      console.log('Booking Clear Clause:', JSON.stringify(clause), 'matches:', count);
                    } catch (e) {
                      console.error('Error counting booking clear clause:', clause, e);
                    }
                  }
                  const totalBookingMatches = await Booking.countDocuments(bookingQuery);
                  console.log('Total booking matches for combined clear query:', totalBookingMatches);
                  const bookingResult = await Booking.updateMany(bookingQuery, { $set: { rentStartDate: null } });
                  console.log(`Cleared rentStartDate (bookings) for ${bookingResult.modifiedCount} booking(s) for vehicle ${vehicle.vehicleId || vehicle._id}`);
                }
              } catch (e) {
                console.error('Failed to clear rentStartDate on Bookings:', e);
              }
            } catch (e) {
              console.error('Failed to clear rentStartDate on DriverPlanSelection:', e);
            }
          }
        }
      }
    } catch (e) {
      console.error('Error while attempting to set rentStartDate after vehicle update:', e);
    }

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    res.json(vehicle);
  } catch (err) {
    console.error('Error updating vehicle:', err);
    if (err && (err.code === 11000 || err.code === '11000')) {
      return res.status(409).json({ message: 'Duplicate registration number' });
    }
    res.status(500).json({ message: err?.message || 'Failed to update vehicle' });
  }
});

// Delete a vehicle
router.delete('/:id', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const result = await Vehicle.deleteOne({ vehicleId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (err) {
    console.error('Error deleting vehicle:', err);
    res.status(500).json({ message: 'Failed to delete vehicle' });
  }
});

// Get weekly rent slabs for a vehicle
router.get('/:id/weekly-rent-slabs', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const vehicle = await Vehicle.findOne({ vehicleId }).lean();
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(vehicle.weeklyRentSlabs || []);
  } catch (err) {
    console.error('Error fetching weekly rent slabs:', err);
    res.status(500).json({ message: 'Failed to fetch weekly rent slabs' });
  }
});

// Update weekly rent slabs for a vehicle
router.put('/:id/weekly-rent-slabs', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const { slabs } = req.body;
    if (!Array.isArray(slabs)) return res.status(400).json({ message: 'slabs must be an array' });
    const updated = await Vehicle.findOneAndUpdate(
      { vehicleId },
      { weeklyRentSlabs: slabs },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(updated.weeklyRentSlabs);
  } catch (err) {
    console.error('Error updating weekly rent slabs:', err);
    res.status(500).json({ message: 'Failed to update weekly rent slabs' });
  }
});

// Get daily rent slabs for a vehicle
router.get('/:id/daily-rent-slabs', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const vehicle = await Vehicle.findOne({ vehicleId }).lean();
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(vehicle.dailyRentSlabs || []);
  } catch (err) {
    console.error('Error fetching daily rent slabs:', err);
    res.status(500).json({ message: 'Failed to fetch daily rent slabs' });
  }
});

// Update daily rent slabs for a vehicle
router.put('/:id/daily-rent-slabs', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const { slabs } = req.body;
    if (!Array.isArray(slabs)) return res.status(400).json({ message: 'slabs must be an array' });
    const updated = await Vehicle.findOneAndUpdate(
      { vehicleId },
      { dailyRentSlabs: slabs },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(updated.dailyRentSlabs);
  } catch (err) {
    console.error('Error updating daily rent slabs:', err);
    res.status(500).json({ message: 'Failed to update daily rent slabs' });
  }
});

// Get monthly profit for a vehicle by vehicleId
router.get('/:id/monthly-profit', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const vehicle = await Vehicle.findOne({ vehicleId }).lean();
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    // Find matching car investment entry
    const CarInvestmentEntry = (await import('../models/carInvestmentEntry.js')).default;
    const category = (vehicle.category || vehicle.carCategory || '').toLowerCase();
    const matchedInvestment = await CarInvestmentEntry.findOne({ name: new RegExp(`^${category}$`, 'i') });

    let monthlyProfit = 0;
    if (vehicle.monthlyProfitMin && vehicle.monthlyProfitMin > 0) {
      monthlyProfit = vehicle.monthlyProfitMin;
    } else if (matchedInvestment) {
      monthlyProfit = matchedInvestment.minAmount * (matchedInvestment.expectedROI / 100) / 12;
    }

    res.json({ vehicleId, monthlyProfit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;