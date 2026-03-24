const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Route = require('../models/Route');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../authMiddleware');

// Create a booking
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { routeId, seatsBooked } = req.body;
        const passengerId = req.userId;

        const route = await Route.findById(routeId);
        if (!route) {
            return res.status(404).json({ message: 'Route not found' });
        }

        if (route.availableSeats < seatsBooked) {
            return res.status(400).json({ message: 'Not enough seats available' });
        }

        const totalPrice = route.fare * seatsBooked;

        // Check wallet balance
        const wallet = await Wallet.findOne({ user: passengerId });
        if (!wallet) {
            return res.status(404).json({ message: 'Wallet not found' });
        }

        if (wallet.balance < totalPrice) {
            return res.status(400).json({ message: 'Insufficient funds in wallet' });
        }

        const booking = new Booking({
            passengerId,
            driverId: route.driverId,
            routeId,
            seatsBooked,
            totalPrice,
            totalPrice,
            status: 'confirmed'
        });

        await booking.save();

        // Deduct from passenger wallet
        wallet.balance -= totalPrice;
        await wallet.save();

        // Create transaction record for passenger
        const transaction = new Transaction({
            wallet: wallet._id,
            type: 'payment',
            amount: totalPrice,
            description: `Booking for route: ${route.startLocation} to ${route.endLocation}`,
            status: 'completed'
        });
        await transaction.save();

        // Credit driver wallet
        const driverWallet = await Wallet.findOne({ user: route.driverId });
        if (driverWallet) {
            driverWallet.balance += totalPrice;
            await driverWallet.save();

            // Create transaction record for driver
            const driverTransaction = new Transaction({
                wallet: driverWallet._id,
                type: 'deposit',
                amount: totalPrice,
                description: `Fare received for route: ${route.startLocation} to ${route.endLocation}`,
                status: 'completed'
            });
            await driverTransaction.save();
        }

        // Optionally update available seats immediately or wait for confirmation
        // For now, let's reserve them
        route.availableSeats -= seatsBooked;
        await route.save();

        res.status(201).json({ message: 'Booking created successfully', booking });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get user's bookings (as passenger)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const bookings = await Booking.find({ passengerId: req.userId })
            .populate('routeId')
            .populate('driverId', 'displayName photoURL driverDetails fullName phoneNumber address');

        const response = bookings.map(b => {
            const obj = b.toObject();
            if (obj.driverId) delete obj.driverId.address;
            return obj;
        });
        res.json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get bookings for a driver
router.get('/driver', authMiddleware, async (req, res) => {
    try {
        const bookings = await Booking.find({ driverId: req.userId })
            .populate('routeId')
            .populate('passengerId', 'displayName photoURL phoneNumber fullName address');

        const response = bookings.map(b => {
            const obj = b.toObject();
            if (obj.passengerId) delete obj.passengerId.address;
            return obj;
        });
        res.json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update booking status (Driver only)
router.put('/:id/status', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body; // 'confirmed', 'rejected', 'completed'
        const bookingId = req.params.id;
        const driverId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Ensure the logged-in user is the driver for this booking
        // Note: Booking driverId is ObjectId, req.user.userId is string usually, need comparison
        if (booking.driverId.toString() !== driverId) {
            return res.status(403).json({ message: 'Access denied. Not the driver for this booking.' });
        }

        const oldStatus = booking.status;
        booking.status = status;
        await booking.save();

        // If rejected by driver, restore seats and refund passenger
        if (status === 'rejected' && oldStatus !== 'rejected') {
            const route = await Route.findById(booking.routeId);
            if (route) {
                route.availableSeats += booking.seatsBooked;
                await route.save();
            }

            // Refund passenger wallet
            const passengerWallet = await Wallet.findOne({ user: booking.passengerId });
            if (passengerWallet) {
                passengerWallet.balance += booking.totalPrice;
                await passengerWallet.save();

                // Create refund transaction for passenger
                const refundTransaction = new Transaction({
                    wallet: passengerWallet._id,
                    type: 'deposit',
                    amount: booking.totalPrice,
                    description: `Refund for rejected booking`,
                    status: 'completed'
                });
                await refundTransaction.save();
            }

            // Deduct from driver wallet
            const driverWallet = await Wallet.findOne({ user: booking.driverId });
            if (driverWallet) {
                driverWallet.balance -= booking.totalPrice;
                await driverWallet.save();

                // Create deduction transaction for driver
                const deductTransaction = new Transaction({
                    wallet: driverWallet._id,
                    type: 'payment',
                    amount: booking.totalPrice,
                    description: `Deduction for rejected booking`,
                    status: 'completed'
                });
                await deductTransaction.save();
            }
        }

        res.json({ message: 'Booking status updated', booking });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Cancel booking (Passenger only)
router.put('/:id/cancel', authMiddleware, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const passengerId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Ensure the logged-in user is the passenger for this booking
        if (booking.passengerId.toString() !== passengerId) {
            return res.status(403).json({ message: 'Access denied. Not your booking.' });
        }

        // Only allow cancellation if not already completed/cancelled/rejected
        if (['completed', 'cancelled', 'rejected'].includes(booking.status)) {
            return res.status(400).json({ message: 'Cannot cancel this booking' });
        }

        booking.status = 'cancelled';
        await booking.save();

        // Restore seats
        const route = await Route.findById(booking.routeId);
        if (route) {
            route.availableSeats += booking.seatsBooked;
            await route.save();
        }

        // Refund passenger wallet
        const passengerWallet = await Wallet.findOne({ user: booking.passengerId });
        if (passengerWallet) {
            passengerWallet.balance += booking.totalPrice;
            await passengerWallet.save();

            // Create refund transaction for passenger
            const refundTransaction = new Transaction({
                wallet: passengerWallet._id,
                type: 'deposit',
                amount: booking.totalPrice,
                description: `Refund for cancelled booking`,
                status: 'completed'
            });
            await refundTransaction.save();
        }

        // Deduct from driver wallet
        const driverWallet = await Wallet.findOne({ user: booking.driverId });
        if (driverWallet) {
            driverWallet.balance -= booking.totalPrice;
            await driverWallet.save();

            // Create deduction transaction for driver
            const deductTransaction = new Transaction({
                wallet: driverWallet._id,
                type: 'payment',
                amount: booking.totalPrice,
                description: `Deduction for cancelled booking`,
                status: 'completed'
            });
            await deductTransaction.save();
        }

        res.json({ message: 'Booking cancelled successfully', booking });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
