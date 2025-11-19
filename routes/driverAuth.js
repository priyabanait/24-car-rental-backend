import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import Driver from '../models/driver.js';
import DriverSignup from '../models/driverSignup.js';

dotenv.config();

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'dev_secret';

// Check if driver is already registered
router.post('/check-registration', async (req, res) => {
	try {
		const { mobile, username } = req.body;
		
		if (!mobile && !username) {
			return res.status(400).json({ message: 'Mobile or username required.' });
		}

		// Build query
		const query = {};
		if (mobile) query.mobile = mobile;
		if (username) query.username = username;

		// Check in DriverSignup collection
		const existingSignup = await DriverSignup.findOne({ $or: [query] });
		if (existingSignup) {
			return res.json({ 
				registered: true,
				message: 'Driver already registered.',
				driverToken: existingSignup.driverToken,
				status: existingSignup.status,
				kycStatus: existingSignup.kycStatus,
				mobile: existingSignup.mobile,
				username: existingSignup.username
			});
		}

		// Check in Driver collection
		const existingDriver = await Driver.findOne({ $or: [query] });
		if (existingDriver) {
			return res.json({ 
				registered: true,
				message: 'Driver already exists in the system.',
				mobile: existingDriver.mobile,
				username: existingDriver.username
			});
		}

		return res.json({ 
			registered: false,
			message: 'Driver not registered. Can proceed with signup.'
		});
	} catch (error) {
		console.error('Check registration error:', error);
		return res.status(500).json({ message: 'Server error during registration check.' });
	}
});

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
			return res.status(400).json({ 
				message: 'Driver already registered with this username.',
				alreadyRegistered: true,
				driverToken: existingUsername.driverToken
			});
		}

		// Check for duplicate mobile in DriverSignup collection
		const existingMobile = await DriverSignup.findOne({ mobile });
		if (existingMobile) {
			return res.status(400).json({ 
				message: 'Driver already registered with this mobile number.',
				alreadyRegistered: true,
				driverToken: existingMobile.driverToken
			});
		}

		// Check in Driver collection as well
		const existingDriver = await Driver.findOne({ 
			$or: [{ mobile }, { username }] 
		});
		if (existingDriver) {
			return res.status(400).json({ 
				message: 'Driver already exists in the system.',
				alreadyRegistered: true
			});
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

		// Generate JWT token
		const token = jwt.sign(
			{ 
				id: driverSignup._id,
				driverToken: driverSignup.driverToken,
				username: driverSignup.username, 
				mobile: driverSignup.mobile,
				type: 'driver'
			}, 
			SECRET, 
			{ expiresIn: '30d' }
		);

		return res.json({ 
			message: 'Signup successful. Driver token generated.',
			token,
			driver: {
				id: driverSignup._id,
				driverToken: driverSignup.driverToken,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				status: driverSignup.status,
				kycStatus: driverSignup.kycStatus
			}
		});
	} catch (error) {
		console.error('Signup error:', error);
		return res.status(500).json({ message: 'Server error during signup.' });
	}
});

// Login (username/password)
router.post('/login', async (req, res) => {
	try {
		const { username, password } = req.body;
		if (!username || !password) {
			return res.status(400).json({ message: 'Username and password required.' });
		}

		// Find driver signup by username
		const driverSignup = await DriverSignup.findOne({ username });
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
				driverToken: driverSignup.driverToken,
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
				driverToken: driverSignup.driverToken,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				status: driverSignup.status,
				kycStatus: driverSignup.kycStatus
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
			return res.status(400).json({ 
				message: 'Driver already registered with this mobile number.',
				alreadyRegistered: true,
				driverToken: existingMobile.driverToken
			});
		}

		// Check in Driver collection as well
		const existingDriver = await Driver.findOne({ mobile });
		if (existingDriver) {
			return res.status(400).json({ 
				message: 'Driver already exists in the system.',
				alreadyRegistered: true
			});
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

		// Generate JWT token
		const token = jwt.sign(
			{ 
				id: driverSignup._id,
				driverToken: driverSignup.driverToken,
				username: driverSignup.username, 
				mobile: driverSignup.mobile,
				type: 'driver'
			}, 
			SECRET, 
			{ expiresIn: '30d' }
		);

		return res.json({ 
			message: 'Signup successful. Driver token generated.',
			token,
			driver: {
				id: driverSignup._id,
				driverToken: driverSignup.driverToken,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				status: driverSignup.status,
				kycStatus: driverSignup.kycStatus
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
				driverToken: driverSignup.driverToken,
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
				driverToken: driverSignup.driverToken,
				username: driverSignup.username,
				mobile: driverSignup.mobile,
				status: driverSignup.status,
				kycStatus: driverSignup.kycStatus
			}
		});
	} catch (error) {
		console.error('Login OTP error:', error);
		return res.status(500).json({ message: 'Server error during login.' });
	}
});

export default router;
