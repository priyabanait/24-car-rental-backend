import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import Driver from '../models/driver.js';
import DriverSignup from '../models/driverSignup.js';
import Notification from '../models/notification.js';

dotenv.config();

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'dev_secret';

// Signup (username/password)
router.post('/signup', async (req, res) => {
	try {
		const { username, mobile, password } = req.body;
		if (!username || !mobile || !password) {
			return res.status(400).json({ message: 'Username, mobile and password required.' });
		}

		// Check for duplicate username in DriverSignup collection
		const existingUsername = await DriverSignup.findOne({ username });
		if (existingUsername) {
			return res.status(400).json({ message: 'Username already exists.' });
		}

		// Check for duplicate mobile in DriverSignup collection
		const existingMobile = await DriverSignup.findOne({ mobile });
		if (existingMobile) {
			return res.status(400).json({ message: 'Mobile number already registered.' });
		}

		// Create new driver signup (password stored in plain text)
		const driverSignup = new DriverSignup({ 
			username, 
			mobile, 
			password,
			status: 'pending',
			kycStatus: 'pending'
		});
		await driverSignup.save();

		// Persist notification to DB so admin can see it later even if socket missed it
		try {
			const notif = await Notification.create({
				type: 'new_driver',
				title: 'New Driver Signup',
				message: `${driverSignup.username || driverSignup.mobile} signed up.`,
				payload: { driverId: driverSignup._id, driver: driverSignup },
				read: false
			});
			console.info('Saved new driver notification:', notif._id || '(no id)');
		} catch (saveErr) {
			console.error('Failed to save new driver notification:', saveErr);
		} 

		// Emit dashboard notification for new signup
		try {
			const io = req.app?.locals?.io;
			if (io) {
                const room = io.sockets.adapter.rooms.get('dashboard');
                const roomSize = room ? room.size : 0;
                console.info('About to emit new_driver to dashboard, room size:', roomSize, 'signup id:', driverSignup._id);
                io.to('dashboard').emit('dashboard_notification', {
                    type: 'new_driver',
                    title: 'New Driver Signup',
                    message: `${driverSignup.username || driverSignup.mobile} signed up.`,
                    driverId: driverSignup._id,
                    driver: driverSignup
                });
            } else {
                console.warn('No io instance available to emit new driver signup notification');
            }
        } catch (emitErr) {
            console.error('Failed to emit new driver signup notification:', emitErr);
        }

		// Generate JWT token
		const token = jwt.sign(
			{ 
				id: driverSignup._id, 
				username: driverSignup.username, 
				mobile: driverSignup.mobile,
				type: 'driver'
			}, 
			SECRET, 
			{ expiresIn: '30d' }
		);

		return res.json({ 
			message: 'Signup successful.',
			token,
			driver: {
				id: driverSignup._id,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				registrationCompleted: driverSignup.registrationCompleted || false
			}
		});
	} catch (error) {
		console.error('Signup error:', error);
		return res.status(500).json({ message: 'Server error during signup.' });
	}
});

// Login (username/password or mobile/password)
router.post('/login', async (req, res) => {
	try {
		const { username, mobile, password } = req.body;
		
		// Check if either username or mobile is provided along with password
		if ((!username && !mobile) || !password) {
			return res.status(400).json({ message: 'Username or mobile, and password are required.' });
		}

		// Find driver signup by username or mobile
		const query = username ? { username } : { mobile };
		const driverSignup = await DriverSignup.findOne(query);
		
		if (!driverSignup) {
			return res.status(401).json({ message: 'Invalid credentials.' });
		}

		// Verify password (plain text comparison)
		if (driverSignup.password !== password) {
			return res.status(401).json({ message: 'Invalid credentials.' });
		}

		// Generate JWT token
		const token = jwt.sign(
			{ 
				id: driverSignup._id, 
				username: driverSignup.username, 
				mobile: driverSignup.mobile,
				type: 'driver'
			}, 
			SECRET, 
			{ expiresIn: '30d' }
		);

		return res.json({ 
			message: 'Login successful.',
			token,
			driver: {
				id: driverSignup._id,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				registrationCompleted: driverSignup.registrationCompleted || false
			}
		});
	} catch (error) {
		console.error('Login error:', error);
		return res.status(500).json({ message: 'Server error during login.' });
	}
});

// Signup/login with OTP (OTP must match password)
router.post('/signup-otp', async (req, res) => {
	try {
		const { mobile, otp, username } = req.body;
		if (!mobile || !otp) {
			return res.status(400).json({ message: 'Mobile and OTP required.' });
		}

		// Check for duplicate mobile in DriverSignup collection
		const existingMobile = await DriverSignup.findOne({ mobile });
		if (existingMobile) {
			return res.status(400).json({ message: 'Mobile number already registered.' });
		}

		// Create new driver signup with OTP as password (plain text)
		const driverSignup = new DriverSignup({ 
			username: username || undefined,
			mobile, 
			password: otp,
			status: 'pending',
			kycStatus: 'pending'
		});
		await driverSignup.save();

		// Persist notification for new OTP signup
		try {
			await Notification.create({
				type: 'new_driver',
				title: 'New Driver Signup',
				message: `${driverSignup.username || driverSignup.mobile} signed up (OTP).`,
				payload: { driverId: driverSignup._id, driver: driverSignup },
				read: false
			});
		} catch (saveErr) {
			console.error('Failed to save new driver (OTP) notification:', saveErr);
		}

		// Emit dashboard notification for new OTP signup
		try {
			const io = req.app?.locals?.io;
			if (io) {
                const room = io.sockets.adapter.rooms.get('dashboard');
                const roomSize = room ? room.size : 0;
                console.info('About to emit new_driver (OTP) to dashboard, room size:', roomSize, 'signup id:', driverSignup._id);
                io.to('dashboard').emit('dashboard_notification', {
                    type: 'new_driver',
                    title: 'New Driver Signup',
                    message: `${driverSignup.username || driverSignup.mobile} signed up (OTP).`,
                    driverId: driverSignup._id,
                    driver: driverSignup
                });
            } else {
                console.warn('No io instance available to emit new driver OTP signup notification');
            }
        } catch (emitErr) {
            console.error('Failed to emit new driver OTP signup notification:', emitErr);
        }

		// Generate JWT token
		const token = jwt.sign(
			{ 
				id: driverSignup._id, 
				username: driverSignup.username, 
				mobile: driverSignup.mobile,
				type: 'driver'
			}, 
			SECRET, 
			{ expiresIn: '30d' }
		);

		return res.json({ 
			message: 'Signup successful.',
			token,
			driver: {
				id: driverSignup._id,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				registrationCompleted: driverSignup.registrationCompleted || false
			}
		});
	} catch (error) {
		console.error('Signup OTP error:', error);
		return res.status(500).json({ message: 'Server error during signup.' });
	}
});

router.post('/login-otp', async (req, res) => {
	try {
		const { mobile, otp } = req.body;
		if (!mobile || !otp) {
			return res.status(400).json({ message: 'Mobile and OTP required.' });
		}

		// Find driver signup by mobile
		const driverSignup = await DriverSignup.findOne({ mobile });
		if (!driverSignup) {
			return res.status(401).json({ message: 'Invalid mobile number or OTP.' });
		}

		// Verify OTP matches the password stored during signup (plain text comparison)
		if (driverSignup.password !== otp) {
			return res.status(401).json({ message: 'Invalid mobile number or OTP.' });
		}

		// Generate JWT token
		const token = jwt.sign(
			{ 
				id: driverSignup._id, 
				username: driverSignup.username, 
				mobile: driverSignup.mobile,
				type: 'driver'
			}, 
			SECRET, 
			{ expiresIn: '30d' }
		);

		return res.json({ 
			message: 'Login successful.',
			token,
			driver: {
				id: driverSignup._id,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				registrationCompleted: driverSignup.registrationCompleted || false
			}
		});
	} catch (error) {
		console.error('Login OTP error:', error);
		return res.status(500).json({ message: 'Server error during login.' });
	}
});

// Forgot Password - Update password using mobile number
router.post('/forgot-password', async (req, res) => {
	try {
		const { mobile, newPassword } = req.body;
		
		// Validate input
		if (!mobile || !newPassword) {
			return res.status(400).json({ message: 'Mobile number and new password required.' });
		}

		// Find driver by mobile number
		const driverSignup = await DriverSignup.findOne({ mobile });
		if (!driverSignup) {
			return res.status(404).json({ message: 'Driver not found with this mobile number.' });
		}

		// Update password (plain text)
		driverSignup.password = newPassword;
		await driverSignup.save();

		return res.json({ 
			message: 'Password updated successfully.',
			driver: {
				id: driverSignup._id,
				username: driverSignup.username,
				mobile: driverSignup.mobile
			}
		});
	} catch (error) {
		console.error('Forgot password error:', error);
		return res.status(500).json({ message: 'Server error during password reset.' });
	}
});

// Complete driver registration
router.put('/complete-registration/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const registrationData = req.body;
		
		// Find driver signup
		const driverSignup = await DriverSignup.findById(id);
		if (!driverSignup) {
			return res.status(404).json({ message: 'Driver not found.' });
		}

		// Update all registration fields
		Object.keys(registrationData).forEach(key => {
			if (registrationData[key] !== undefined && registrationData[key] !== null) {
				driverSignup[key] = registrationData[key];
			}
		});

		// Mark registration as completed
		driverSignup.registrationCompleted = true;
		driverSignup.status = 'pending'; // Set to pending for admin approval
		driverSignup.kycStatus = 'pending';

		await driverSignup.save();

		// Persist registration completed notification
		try {
			const notif = await Notification.create({
				type: 'driver_registration_completed',
				title: 'Driver Registration Completed',
				message: `${driverSignup.username || driverSignup.mobile} completed registration.`,
				payload: { driverId: driverSignup._id, driver: driverSignup },
				read: false
			});
			console.info('Saved registration completed notification:', notif._id || '(no id)');
		} catch (saveErr) {
			console.error('Failed to save registration completed notification:', saveErr);
		} 

		// Emit dashboard notification for completed registration
		try {
			const io = req.app?.locals?.io;
			if (io) {
				io.to('dashboard').emit('dashboard_notification', {
					type: 'driver_registration_completed',
					title: 'Driver Registration Completed',
					message: `${driverSignup.username || driverSignup.mobile} completed registration.`,
					driverId: driverSignup._id,
					driver: driverSignup
				});
			}
		} catch (emitErr) {
			console.error('Failed to emit registration completed notification:', emitErr);
		}

		return res.json({ 
			message: 'Registration completed successfully. Your profile is under review.',
			driver: {
				id: driverSignup._id,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				registrationCompleted: driverSignup.registrationCompleted
			}
		});
	} catch (error) {
		console.error('Complete registration error:', error);
		return res.status(500).json({ message: 'Server error during registration completion.' });
	}
});

// Get driver registration data by mobile number
router.get('/registration/by-mobile/:mobile', async (req, res) => {
	try {
		const { mobile } = req.params;

		if (!mobile) {
			return res.status(400).json({ message: 'Mobile number is required.' });
		}

		// Find driver signup by mobile
		const driverSignup = await DriverSignup.findOne({ mobile })
			.select('-password') // Exclude password from response
			.lean();

		if (!driverSignup) {
			return res.status(404).json({ message: 'Driver not found with this mobile number.' });
		}

		return res.json({
			success: true,
			driver: driverSignup
		});
	} catch (error) {
		console.error('Get driver registration error:', error);
		return res.status(500).json({ message: 'Server error fetching driver data.' });
	}
});

// Get driver registration data by ID
router.get('/registration/:id', async (req, res) => {
	try {
		const { id } = req.params;

		if (!id) {
			return res.status(400).json({ message: 'Driver ID is required.' });
		}

		// Find driver signup by ID
		const driverSignup = await DriverSignup.findById(id)
			.select('-password') // Exclude password from response
			.lean();

		if (!driverSignup) {
			return res.status(404).json({ message: 'Driver not found.' });
		}

		return res.json({
			success: true,
			driver: driverSignup
		});
	} catch (error) {
		console.error('Get driver registration error:', error);
		return res.status(500).json({ message: 'Server error fetching driver data.' });
	}
});

export default router;
