import '../db.js';
import Vehicle from '../models/vehicle.js';

async function checkVehicles() {
  try {
    const total = await Vehicle.countDocuments();
    const bangaloreCount = await Vehicle.countDocuments({ city: /bangalore/i });
    const activeCount = await Vehicle.countDocuments({ status: 'active' });
    const bangaloreActiveCount = await Vehicle.countDocuments({ 
      city: /bangalore/i, 
      status: 'active' 
    });

    console.log('=== Vehicle Statistics ===');
    console.log('Total vehicles:', total);
    console.log('Bangalore vehicles:', bangaloreCount);
    console.log('Active vehicles:', activeCount);
    console.log('Bangalore active vehicles:', bangaloreActiveCount);

    console.log('\n=== First 10 vehicles ===');
    const vehicles = await Vehicle.find({})
      .select('vehicleId registrationNumber brand model city status')
      .limit(10)
      .lean();

    vehicles.forEach(v => {
      console.log(`ID: ${v.vehicleId}, Reg: ${v.registrationNumber}, Brand: ${v.brand} ${v.model}, City: ${v.city || 'N/A'}, Status: ${v.status || 'N/A'}`);
    });

    console.log('\n=== Bangalore Active vehicles ===');
    const bangaloreVehicles = await Vehicle.find({ 
      city: /bangalore/i, 
      status: 'active' 
    })
      .select('vehicleId registrationNumber brand model city status carFullPhoto pricePerDay')
      .limit(10)
      .lean();

    bangaloreVehicles.forEach(v => {
      console.log(`ID: ${v.vehicleId}, ${v.brand} ${v.model}, City: ${v.city}, Price: ${v.pricePerDay}, Photo: ${v.carFullPhoto ? 'Yes' : 'No'}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkVehicles();
