import express from 'express';
import Vehicle from '../models/vehicle.js';
import { authenticateToken } from './middleware.js';
import { uploadToCloudinary } from '../lib/cloudinary.js';

const router = express.Router();

// Get all vehicles
router.get('/', async (req, res) => {
  try {
    const list = await Vehicle.find().lean();
    res.json(list);
  } catch (err) {
    console.error('Error fetching vehicles:', err);
    res.status(500).json({ message: 'Failed to fetch vehicles' });
  }
});

// Get a single vehicle by ID
router.get('/:id', async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const vehicle = await Vehicle.findOne({ vehicleId }).lean();
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    res.json(vehicle);
  } catch (err) {
    console.error('Error fetching vehicle:', err);
    res.status(500).json({ message: 'Failed to fetch vehicle' });
  }
});

// Create a new vehicle
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!req.body.registrationNumber) {
      return res.status(400).json({ message: 'Registration number is required' });
    }

    let vehicleData = {
      status: 'inactive',
      kycStatus: 'pending',
      ...req.body
    };

    const documentFields = ['insuranceDoc', 'rcDoc', 'permitDoc', 'pollutionDoc', 'fitnessDoc'];
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
    res.status(500).json({ message: 'Failed to create vehicle' });
  }
});

// Update a vehicle
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const vehicleId = Number(req.params.id);
    const updates = req.body;

    const documentFields = ['insuranceDoc', 'rcDoc', 'permitDoc', 'pollutionDoc', 'fitnessDoc'];
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
      }
    }

    const vehicle = await Vehicle.findOneAndUpdate(
      { vehicleId },
      { ...updates, ...uploadedDocs },
      { new: true }
    ).lean();

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    res.json(vehicle);
  } catch (err) {
    console.error('Error updating vehicle:', err);
    res.status(500).json({ message: 'Failed to update vehicle' });
  }
});

// Delete a vehicle
router.delete('/:id', authenticateToken, async (req, res) => {
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

export default router;