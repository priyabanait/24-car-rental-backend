
import express from 'express';
import Driver from '../models/driver.js';
import DriverSignup from '../models/driverSignup.js';
import Notification from '../models/notification.js';
// auth middleware not applied; token used only for login
import { uploadToCloudinary } from '../lib/cloudinary.js';

const router = express.Router();

// Update a driver signup credential
router.put('/signup/credentials/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await DriverSignup.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Driver signup not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error updating driver signup:', err);
    res.status(400).json({ message: 'Failed to update driver signup', error: err.message });
  }
});

// Delete a driver signup credential
router.delete('/signup/credentials/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await DriverSignup.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Driver signup not found' });
    }
    res.json({ message: 'Driver signup deleted', driver: deleted });
  } catch (err) {
    console.error('Error deleting driver signup:', err);
    res.status(400).json({ message: 'Failed to delete driver signup', error: err.message });
  }
});
// GET driver form data by mobile number
router.get('/form/mobile/:phone', async (req, res) => {
try {
    const { phone } = req.params;
    const driver = await Driver.findOne({ phone }).lean();
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    res.json({ driver });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch driver', message: error.message });
  }
});

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

router.get('/', async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Fetch from both DriverSignup (self-registered) and Driver (admin-created)
    const [signupList, driverList] = await Promise.all([
      DriverSignup.find({}).lean(),
      Driver.find({}).lean()
    ]);

    // Normalize records into a common shape
    const mapSignup = (d) => ({
      source: 'signup',
      id: d._id,
      username: d.username || null,
      name: d.username || null,
      mobile: d.mobile || null,
      email: d.email || null,
      status: d.status || null,
      kycStatus: d.kycStatus || null,
      registrationCompleted: !!d.registrationCompleted,
      // Expose contact & location fields so list API contains them directly
      employeeId: d.employeeId || '',
      city: d.city || '',
      state: d.state || '',
      emergencyContact: d.emergencyContact || '',
      emergencyRelation: d.emergencyRelation || '',
      emergencyPhone: d.emergencyPhone || '',
      emergencyPhoneSecondary: d.emergencyPhoneSecondary || '',
      joinDate: d.signupDate || d.createdAt,
      _raw: d
    });

    const mapDriver = (d) => ({
      source: 'manual',
      id: d._id || d.id,
      username: d.username || d.name || null,
      name: d.name || d.username || null,
      mobile: d.mobile || d.phone || null,
      email: d.email || null,
      status: d.status || null,
      kycStatus: d.kycStatus || null,
      registrationCompleted: !!d.registrationCompleted,
      // Expose contact & location fields so list API contains them directly
      employeeId: d.employeeId || '',
      city: d.city || '',
      state: d.state || '',
      emergencyContact: d.emergencyContact || '',
      emergencyRelation: d.emergencyRelation || '',
      emergencyPhone: d.emergencyPhone || '',
      emergencyPhoneSecondary: d.emergencyPhoneSecondary || '',
      joinDate: d.joinDate || d.createdAt,
      _raw: d
    });

    const combined = [
      ...signupList.map(mapSignup),
      ...driverList.map(mapDriver)
    ];

    // Generic value getter for sorting
    const getVal = (item, field) => {
      if (!item) return 0;
      return item[field] || item.joinDate || item._raw?.createdAt || 0;
    };

    combined.sort((a, b) => {
      const va = getVal(a, sortBy);
      const vb = getVal(b, sortBy);
      if (va < vb) return sortOrder === 1 ? -1 : 1;
      if (va > vb) return sortOrder === 1 ? 1 : -1;
      return 0;
    });

    const total = combined.length;
    const paged = combined.slice(skip, skip + limit);

    res.json({
      data: paged,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({ message: 'Failed to fetch drivers', error: error.message });
  }
});

// GET signup drivers (self-registered with username/mobile/password)
router.get('/signup/credentials', async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'signupDate';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const total = await DriverSignup.countDocuments();
    const list = await DriverSignup.find()
      .select('username mobile password status kycStatus signupDate')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
    
    res.json({
      data: list,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error('Error fetching signup credentials:', error);
    res.status(500).json({ message: 'Failed to fetch signup credentials' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const idParam = req.params.id;

    // Try to find in DriverSignup by _id first
    let item = await DriverSignup.findById(idParam).lean();

    // If not found, try Driver by _id
    if (!item) {
      try {
        item = await Driver.findById(idParam).lean();
      } catch (e) {
        // ignore cast errors
      }
    }

    // If still not found, try numeric id in Driver collection
    if (!item) {
      const numericId = Number(idParam);
      if (!isNaN(numericId)) {
        item = await Driver.findOne({ id: numericId }).lean();
      }
    }

    if (!item) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Normalize fields so UI forms get consistent properties
    const normalized = { ...item };

    // If this looks like a DriverSignup (username/mobile), map to 'name'/'phone' for UI
    if (!normalized.name && normalized.username) normalized.name = normalized.username;
    if (!normalized.phone && normalized.mobile) normalized.phone = normalized.mobile || normalized.phone;
    if (!normalized.email && normalized.username && /@/.test(normalized.username)) normalized.email = normalized.username;

    // Provide consistent joinDate and id fields
    const mappedItem = {
      ...normalized,
      id: normalized._id || normalized.id,
      joinDate: normalized.signupDate || normalized.joinDate || normalized.createdAt
    };

    res.json(mappedItem);
  } catch (error) {
    console.error('Error fetching driver:', error);
    res.status(500).json({ message: 'Failed to fetch driver', error: error.message });
  }
});


// Create new driver with document uploads
router.post('/', async (req, res) => {
  try {
    const fields = stripAuthFields(req.body);
    const max = await Driver.find().sort({ id: -1 }).limit(1).lean();
    const nextId = (max[0]?.id || 0) + 1;

    // Handle document uploads to Cloudinary
    const documentFields = ['profilePhoto', 'licenseDocument', 'aadharDocument', 'aadharDocumentBack', 'panDocument', 'bankDocument', 'electricBillDocument'];
    const uploadedDocs = {};

    for (const field of documentFields) {
      if (fields[field] && fields[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(fields[field], `drivers/${nextId}/${field}`);
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
      }
    }


    // Add emergency contact relation and secondary phone
    const driverData = {
      id: nextId,
      ...fields,
      ...uploadedDocs,
      isManualEntry: true,
      registrationCompleted: true, // Mark registration as completed when admin fills the form
      emergencyRelation: fields.emergencyRelation || '',
      emergencyPhoneSecondary: fields.emergencyPhoneSecondary || ''
    };

    // Remove base64 data to prevent large document size
    documentFields.forEach(field => {
      if (driverData[field]?.startsWith('data:')) {
        delete driverData[field];
      }
    });

    // Set registrationCompleted=true in DriverSignup if mobile matches
    if (driverData.mobile) {
      await DriverSignup.findOneAndUpdate(
        { mobile: driverData.mobile },
        { registrationCompleted: true, status: 'active' }
      );
    }

    const newDriver = await Driver.create(driverData);

    // Persist notification for admin-created driver so admins can see it even if socket missed it
    try {
      const notif = await Notification.create({
        type: 'driver_created_by_admin',
        title: 'Driver Added by Admin',
        message: `${newDriver.name || newDriver.username || newDriver.mobile} was added by admin.`,
        payload: { driverId: newDriver._id || newDriver.id, driver: newDriver },
        read: false
      });
      console.info('Saved admin-created driver notification:', notif._id || '(no id)');
    } catch (saveErr) {
      console.error('Failed to save admin driver created notification:', saveErr);
    }

    // Emit dashboard notification about admin-created driver
    try {
      const io = req.app?.locals?.io;
      if (io) {
        // diagnostic: log room membership and payload
        const room = io.sockets.adapter.rooms.get('dashboard');
        const roomSize = room ? room.size : 0;
        console.info('About to emit driver_created_by_admin to dashboard, room size:', roomSize, 'driver:', newDriver._id || newDriver.id);
        io.to('dashboard').emit('dashboard_notification', {
          type: 'driver_created_by_admin',
          title: 'Driver Added by Admin',
          message: `${newDriver.name || newDriver.username || newDriver.mobile} was added by admin.`,
          driverId: newDriver._id || newDriver.id,
          driver: newDriver
        });
      } else {
        console.warn('No io instance available to emit admin driver created notification');
      }
    } catch (emitErr) {
      console.error('Failed to emit admin driver created notification:', emitErr);
    }

    res.status(201).json(newDriver);
  } catch (err) {
    console.error('Driver create error:', err);
    res.status(500).json({ message: 'Failed to create driver', error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const fields = stripAuthFields(req.body);

    // Handle document uploads to Cloudinary
    const documentFields = ['profilePhoto', 'licenseDocument', 'aadharDocument', 'aadharDocumentBack', 'panDocument', 'bankDocument', 'electricBillDocument'];
    const uploadedDocs = {};

    for (const field of documentFields) {
      if (fields[field] && fields[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(fields[field], `drivers/${req.params.id}/${field}`);
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
      }
    }

    // Add emergency contact relation and secondary phone
    const updateData = {
      ...fields,
      ...uploadedDocs,
      emergencyRelation: fields.emergencyRelation || '',
      emergencyPhoneSecondary: fields.emergencyPhoneSecondary || ''
    };

    // Remove base64 data to prevent large document size
    documentFields.forEach(field => {
      if (updateData[field]?.startsWith('data:')) {
        delete updateData[field];
      }
    });

    const idParam = req.params.id;
    console.info('Driver PUT requested for id:', idParam);

    // Robust lookup strategy: try DriverSignup by _id, Driver by _id, Driver by numeric id,
    // and finally flexible lookup by phone/mobile/username/email. This helps when frontend
    // passes an unexpected identifier.
    let updated = null;

    // 1) DriverSignup by _id
    let signupDoc = null;
    try { signupDoc = await DriverSignup.findById(idParam).lean(); } catch (e) { /* ignore */ }
    if (signupDoc) {
      console.info('Updating DriverSignup _id:', signupDoc._id);
      updated = await DriverSignup.findByIdAndUpdate(signupDoc._id, updateData, { new: true }).lean();
    }

    // 2) Driver by _id
    if (!updated) {
      try {
        const drv = await Driver.findById(idParam).lean();
        if (drv) {
          console.info('Updating Driver by _id:', drv._id);
          updated = await Driver.findByIdAndUpdate(drv._id, updateData, { new: true }).lean();
        }
      } catch (e) {
        // ignore cast errors
      }
    }

    // 3) Driver by numeric id field
    if (!updated) {
      const numericId = Number(idParam);
      if (!isNaN(numericId)) {
        const drvNum = await Driver.findOne({ id: numericId }).lean();
        if (drvNum) {
          console.info('Updating Driver by numeric id:', numericId);
          updated = await Driver.findOneAndUpdate({ id: numericId }, updateData, { new: true }).lean();
        }
      }
    }

    // 4) Flexible lookup by phone/mobile/username/email
    const attemptedLookups = [];
    if (!updated) {
      attemptedLookups.push('flexible: phone/mobile/username/email');
      const flexible = await Driver.findOne({ $or: [{ mobile: idParam }, { phone: idParam }, { username: idParam }, { email: idParam }] }).lean();
      if (flexible) {
        console.info('Updating Driver by flexible match, _id:', flexible._id);
        updated = await Driver.findByIdAndUpdate(flexible._id, updateData, { new: true }).lean();
      }
    }

    if (!updated) {
      console.warn('Driver not found for id:', idParam, 'attempted lookups:', attemptedLookups.join(', '));
      // Return a bit more context to help debugging in dev; keep message consistent
      return res.status(404).json({ message: 'Driver not found', attemptedLookups });
    }

    res.json(updated);
  } catch (err) {
    console.error('Driver update error:', err);
    res.status(500).json({ message: 'Failed to update driver', error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    // Try to delete from DriverSignup first (MongoDB _id)
    let deleted = await DriverSignup.findByIdAndDelete(req.params.id);
    
    // If not found, try Driver collection by _id
    if (!deleted) {
      try {
        deleted = await Driver.findByIdAndDelete(req.params.id);
      } catch (e) {
        // ignore cast errors
      }
    }

    // If still not found, try Driver collection with numeric id
    if (!deleted) {
      const numericId = Number(req.params.id);
      if (!isNaN(numericId)) {
        deleted = await Driver.findOneAndDelete({ id: numericId });
      }
    }
    
    if (!deleted) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    
    res.json({ message: 'Deleted', driver: deleted });
  } catch (err) {
    console.error('Driver delete error:', err);
    res.status(500).json({ message: 'Failed to delete driver', error: err.message });
  }
});

// GET driver earnings summary
router.get('/earnings/summary', async (req, res) => {
  try {
    // Mock driver earnings data (replace with actual calculation from trips/payments)
    const driverEarnings = [
      {
        driverId: 'DR001',
        driverName: 'Rajesh Kumar',
        monthlyEarnings: 52000,
        totalTrips: 180,
        averageRating: 4.7,
        totalDistance: 1800,
        pendingAmount: 0,
        lastPayment: '2024-11-01'
      },
      {
        driverId: 'DR002',
        driverName: 'Priya Sharma',
        monthlyEarnings: 65000,
        totalTrips: 220,
        averageRating: 4.9,
        totalDistance: 2200,
        pendingAmount: 15725,
        lastPayment: '2024-10-25'
      },
      {
        driverId: 'DR003',
        driverName: 'Amit Singh',
        monthlyEarnings: 48000,
        totalTrips: 160,
        averageRating: 4.5,
        totalDistance: 1600,
        pendingAmount: 5000,
        lastPayment: '2024-11-02'
      },
      {
        driverId: 'DR004',
        driverName: 'Sunita Patel',
        monthlyEarnings: 42000,
        totalTrips: 145,
        averageRating: 4.6,
        totalDistance: 1450,
        pendingAmount: 10200,
        lastPayment: '2024-10-28'
      },
      {
        driverId: 'DR005',
        driverName: 'Vikram Reddy',
        monthlyEarnings: 58000,
        totalTrips: 195,
        averageRating: 4.8,
        totalDistance: 1950,
        pendingAmount: 0,
        lastPayment: '2024-11-03'
      }
    ];
    
    res.json(driverEarnings);
  } catch (err) {
    console.error('Error fetching driver earnings:', err);
    res.status(500).json({ message: 'Failed to fetch driver earnings', error: err.message });
  }
});

export default router;
