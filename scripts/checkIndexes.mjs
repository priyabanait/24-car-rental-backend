import mongoose from 'mongoose';
import { config } from 'dotenv';
config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/udriver';

async function checkIndexes() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const Vehicle = mongoose.connection.collection('vehicles');
        const indexes = await Vehicle.indexes();
        console.log('Current indexes:', JSON.stringify(indexes, null, 2));

        // Drop problematic indexes if they exist
        await Vehicle.dropIndex('id_1');
        console.log('Dropped id_1 index');

        mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkIndexes();