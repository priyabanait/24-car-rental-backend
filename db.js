import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not set in environment');
  }

  await mongoose.connect(MONGODB_URI);

  console.log('Connected to MongoDB');
}

// seedDB is intentionally a no-op. We do not pre-populate the database
// with mock/domain data. Records will be created only when users submit
// forms or through API calls. This prevents accidental test data from
// appearing in the production DB.
export async function seedDB() {
  // No seeding performed. Intentionally left blank.
  return;
}
