// Shared in-memory driver payments store
// Note: This is a simple in-memory store for development/demo purposes only.
// For production, persist this in a DB collection (e.g., `driverPayments`).

let driverPayments = [
  {
    id: 1,
    driverId: 'DR001',
    driverName: 'Rajesh Kumar',
    phone: '+91-9876543210',
    paymentType: 'weekly_earnings',
    period: 'Week 1, Nov 2024',
    amount: 15000,
    commissionAmount: 2250,
    commissionRate: 15,
    netPayment: 12750,
    totalTrips: 45,
    totalDistance: 450,
    status: 'paid',
    paymentMethod: 'Bank Transfer',
    transactionId: 'TXN123456789',
    paymentDate: '2024-11-01',
    bankDetails: {
      accountName: 'Rajesh Kumar',
      accountNumber: '1234567890',
      ifsc: 'HDFC0001234',
      bank: 'HDFC Bank'
    }
  },
  {
    id: 2,
    driverId: 'DR002',
    driverName: 'Priya Sharma',
    phone: '+91-9876543211',
    paymentType: 'weekly_earnings',
    period: 'Week 1, Nov 2024',
    amount: 18500,
    commissionAmount: 2775,
    commissionRate: 15,
    netPayment: 15725,
    totalTrips: 52,
    totalDistance: 520,
    status: 'pending',
    paymentMethod: 'UPI',
    transactionId: null,
    paymentDate: '2024-11-08',
    bankDetails: {
      accountName: 'Priya Sharma',
      upiId: 'priya@paytm'
    }
  }
];

async function getDriverPayments() {
  try {
    const mod = await import('../models/driverPayment.js').catch(() => null);
    const DriverPayment = mod ? mod.default : null;
    if (DriverPayment) {
      const rows = await DriverPayment.find().sort({ createdAt: -1 }).lean().exec();
      return rows;
    }
  } catch (err) {
    console.error('Error fetching driver payments from DB:', err);
  }
  // Fallback to in-memory
  return driverPayments;
}

function findPaymentIndexByBookingId(bookingId) {
  return driverPayments.findIndex(p => p.bookingId && p.bookingId.toString() === bookingId.toString());
}

async function addDriverPayment(payload) {
  try {
    // Avoid duplicate entries for the same booking (DB or in-memory)
    if (payload.bookingId) {
      // check DB first
      try {
        const mod = await import('../models/driverPayment.js').catch(() => null);
        const DriverPayment = mod ? mod.default : null;
        if (DriverPayment) {
          const existing = await DriverPayment.findOne({ bookingId: payload.bookingId });
          if (existing) return existing.toObject();
        }
      } catch (e) {
        // ignore
      }

      const existingMem = driverPayments.find(p => p.bookingId && p.bookingId.toString() === payload.bookingId.toString());
      if (existingMem) return existingMem;
    }

    // If model exists, persist to DB
    const mod = await import('../models/driverPayment.js').catch(() => null);
    const DriverPayment = mod ? mod.default : null;
    if (DriverPayment) {
      // compute numeric id for backward compatibility
      const maxRow = await DriverPayment.findOne().sort({ id: -1 }).select('id').lean();
      const newId = maxRow && maxRow.id ? maxRow.id + 1 : 1;
      const doc = new DriverPayment({
        ...payload,
        id: newId,
        paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : new Date()
      });
      await doc.save();
      return doc.toObject();
    }

    // Fallback to in-memory
    const newId = driverPayments.length > 0 ? Math.max(...driverPayments.map(p => p.id)) + 1 : 1;
    const entry = {
      id: newId,
      ...payload,
      paymentDate: payload.paymentDate || new Date().toISOString().split('T')[0]
    };
    driverPayments.push(entry);
    return entry;
  } catch (err) {
    console.error('addDriverPayment error:', err);
    throw err;
  }
}

async function updateDriverPayment(id, updates) {
  try {
    const mod = await import('../models/driverPayment.js').catch(() => null);
    const DriverPayment = mod ? mod.default : null;
    if (DriverPayment) {
      const doc = await DriverPayment.findOneAndUpdate({ id }, updates, { new: true });
      if (doc) return doc.toObject();
    }
  } catch (e) {
    console.error('DB updateDriverPayment error:', e);
  }

  const index = driverPayments.findIndex(p => p.id === id);
  if (index === -1) return null;
  driverPayments[index] = { ...driverPayments[index], ...updates };
  return driverPayments[index];
}

async function removeDriverPayment(id) {
  try {
    const mod = await import('../models/driverPayment.js').catch(() => null);
    const DriverPayment = mod ? mod.default : null;
    if (DriverPayment) {
      const doc = await DriverPayment.findOneAndDelete({ id });
      if (doc) return doc.toObject();
    }
  } catch (e) {
    console.error('DB removeDriverPayment error:', e);
  }

  const index = driverPayments.findIndex(p => p.id === id);
  if (index === -1) return null;
  const deleted = driverPayments.splice(index, 1)[0];
  return deleted;
}

export { driverPayments, getDriverPayments, addDriverPayment, updateDriverPayment, findPaymentIndexByBookingId, removeDriverPayment };