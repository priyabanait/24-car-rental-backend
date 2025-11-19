
import express from 'express';
import Driver from '../models/driver.js';
import DriverSignup from '../models/driverSignup.js';
// auth middleware not applied; token used only for login
import { uploadToCloudinary } from '../lib/cloudinary.js';

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

router.get('/', async (req, res) => {
  // Only fetch drivers added manually by admin (not self-registered)
  const list = await Driver.find({ isManualEntry: true }).lean();
  res.json(list);
});

// GET signup drivers (self-registered with username/mobile/password)
router.get('/signup/credentials', async (req, res) => {
  try {
    // Fetch all driver signups from separate collection
    const list = await DriverSignup.find().select('driverToken username mobile password status kycStatus signupDate isVerified').lean();
    res.json(list);
  } catch (error) {
    console.error('Error fetching signup credentials:', error);
    res.status(500).json({ message: 'Failed to fetch signup credentials' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const item = await Driver.findOne({ id }).lean();
  if (!item) return res.status(404).json({ message: 'Driver not found' });
  res.json(item);
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

    // Create driver with uploaded document URLs
    const driverData = {
      id: nextId,
      ...fields,
      ...uploadedDocs,
      isManualEntry: true // Mark as manually added by admin
    };

    // Remove base64 data to prevent large document size
    documentFields.forEach(field => {
      if (driverData[field]?.startsWith('data:')) {
        delete driverData[field];
      }
    });

    const newDriver = await Driver.create(driverData);
    res.status(201).json(newDriver);
  } catch (err) {
    console.error('Driver create error:', err);
    res.status(500).json({ message: 'Failed to create driver', error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fields = stripAuthFields(req.body);

    // Handle document uploads to Cloudinary
    const documentFields = ['profilePhoto', 'licenseDocument', 'aadharDocument', 'aadharDocumentBack', 'panDocument', 'bankDocument', 'electricBillDocument'];
    const uploadedDocs = {};

    for (const field of documentFields) {
      if (fields[field] && fields[field].startsWith('data:')) {
        try {
          const result = await uploadToCloudinary(fields[field], `drivers/${id}/${field}`);
          uploadedDocs[field] = result.secure_url;
        } catch (uploadErr) {
          console.error(`Failed to upload ${field}:`, uploadErr);
        }
      }
    }

    // Update driver data with uploaded document URLs
    const updateData = {
      ...fields,
      ...uploadedDocs
    };

    // Remove base64 data to prevent large document size
    documentFields.forEach(field => {
      if (updateData[field]?.startsWith('data:')) {
        delete updateData[field];
      }
    });

    const updated = await Driver.findOneAndUpdate(
      { id },
      updateData,
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Driver update error:', err);
    res.status(500).json({ message: 'Failed to update driver', error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  await Driver.deleteOne({ id });
  res.json({ message: 'Deleted' });
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
