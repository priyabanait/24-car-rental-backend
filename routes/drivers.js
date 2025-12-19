
import express from 'express';
import Driver from '../models/driver.js';
import DriverSignup from '../models/driverSignup.js';
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

    // Fetch from DriverSignup (where users register through website)
    const filter = {};
    
    const total = await DriverSignup.countDocuments(filter);
    const list = await DriverSignup.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Map DriverSignup to match expected Driver format
    const mappedList = list.map(driver => ({
      ...driver,
      id: driver._id,
      joinDate: driver.signupDate || driver.createdAt
    }));
    
    res.json({
      data: mappedList,
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
    // Try to find by MongoDB _id first (for DriverSignup entries)
    let item = await DriverSignup.findById(req.params.id).lean();
    
    // If not found, try numeric id in Driver collection
    if (!item) {
      const numericId = Number(req.params.id);
      if (!isNaN(numericId)) {
        item = await Driver.findOne({ id: numericId }).lean();
      }
    }
    
    if (!item) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    
    // Map to expected format
    const mappedItem = {
      ...item,
      id: item._id || item.id,
      joinDate: item.signupDate || item.joinDate || item.createdAt
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

    // Try to update in DriverSignup first (MongoDB _id)
    let updated = await DriverSignup.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).lean();

    // If not found, try Driver collection with numeric id
    if (!updated) {
      const numericId = Number(req.params.id);
      if (!isNaN(numericId)) {
        updated = await Driver.findOneAndUpdate(
          { id: numericId },
          updateData,
          { new: true }
        ).lean();
      }
    }

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
  try {
    // Try to delete from DriverSignup first (MongoDB _id)
    let deleted = await DriverSignup.findByIdAndDelete(req.params.id);
    
    // If not found, try Driver collection with numeric id
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
