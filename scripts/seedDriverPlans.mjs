import { connectDB } from '../db.js';
import DriverPlan from '../models/driverPlan.js';

async function seed() {
  await connectDB();

  const plans = [
    {
      name: 'Wagon R - Rent Plan',
      type: 'economy',
      amount: 0,
      description: 'Wagon R weekly rent slabs (reference).',
      features: ['Rent slab based on weekly trips', 'Accidental cover included', 'Standard acceptance rate'],
      status: 'active',
      driversCount: 0,
      createdDate: new Date().toISOString()
    },
    {
      name: 'Spresso - Rent Plan',
      type: 'economy',
      amount: 0,
      description: 'Spresso weekly rent slabs (reference).',
      features: ['Rent slab based on weekly trips', 'Accidental cover included', 'Standard acceptance rate'],
      status: 'active',
      driversCount: 0,
      createdDate: new Date().toISOString()
    }
  ];

  for (const p of plans) {
    const exists = await DriverPlan.findOne({ name: p.name });
    if (exists) {
      console.log(`Plan already exists: ${p.name}`);
      continue;
    }
    const created = new DriverPlan(p);
    await created.save();
    console.log(`Created plan: ${p.name}`);
  }

  console.log('Seeding completed');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed', err);
  process.exit(1);
});
