const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../authMiddleware');

// Register as a driver
router.post('/register', authMiddleware, async (req, res) => {
    try {
        const { licenseNumber, vehicleModel, vehicleNumber, experienceYears } = req.body;
        const userId = req.user.userId;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.role = 'driver';
        user.driverDetails = {
            licenseNumber,
            vehicleModel,
            vehicleNumber,
            experienceYears
        };
        user.isAvailable = true;

        await user.save();
        res.json({ message: 'Driver registered successfully', user });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update driver location
router.put('/location', authMiddleware, async (req, res) => {
    try {
        const { longitude, latitude } = req.body;
        const userId = req.user.userId;

        const user = await User.findById(userId);
        if (!user || user.role !== 'driver') {
            return res.status(403).json({ message: 'Access denied. Drivers only.' });
        }

        user.location = {
            type: 'Point',
            coordinates: [longitude, latitude]
        };

        await user.save();
        res.json({ message: 'Location updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update driver availability status
router.put('/status', authMiddleware, async (req, res) => {
    try {
        const { isAvailable } = req.body;
        const userId = req.user.userId;

        const user = await User.findById(userId);
        if (!user || user.role !== 'driver') {
            return res.status(403).json({ message: 'Access denied. Drivers only.' });
        }

        user.isAvailable = isAvailable;
        await user.save();
        res.json({ message: 'Status updated successfully', isAvailable: user.isAvailable });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get driver details
router.get('/:id', async (req, res) => {
    try {
        const driver = await User.findById(req.params.id).select('-password');
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({ message: 'Driver not found' });
        }
        res.json(driver);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
