// routes/routeRoutes.js

const express = require("express");
const router = express.Router();
const Route = require("../models/Route");
const Booking = require("../models/Booking");
const authMiddleware = require("../authMiddleware"); // ← SAME AS EVERYWHERE ELSE

// GET all active routes (public - for passengers)
router.get("/", async (req, res) => {
	try {
		const routes = await Route.find({ isActive: true })
			.sort({ postedAt: -1 })
			.populate("driverId", "displayName photoURL driverDetails vehicleNumber fullName phoneNumber address");

		const response = routes.map((r) => {
			const obj = r.toObject();
			if (obj.driverId) delete obj.driverId.address;
			return obj;
		});

		res.json(response);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// GET driver's own posted routes + booking info (PROTECTED)
router.get("/my-posted", authMiddleware, async (req, res) => {
	try {
		const routes = await Route.find({ driverId: req.userId })
			.sort({ postedAt: -1 })
			.populate("driverId", "displayName photoURL fullName phoneNumber address");

		const routesWithBookings = await Promise.all(
			routes.map(async (route) => {
				const bookings = await Booking.find({ routeId: route._id })
					.populate("passengerId", "displayName photoURL phoneNumber address")
					.select("seatsBooked status passengerId");

				const bookedSeats = bookings.reduce((sum, b) => sum + b.seatsBooked, 0);

				const routeObj = route.toObject();
				if (routeObj.driverId) delete routeObj.driverId.address;

				const bookingsObj = bookings.map(b => {
					const bObj = b.toObject();
					if (bObj.passengerId) delete bObj.passengerId.address;
					return bObj;
				});

				return {
					...routeObj,
					bookings: bookingsObj,
					bookedSeats,
				};
			})
		);

		res.json(routesWithBookings);
	} catch (error) {
		console.error("Error fetching my-posted routes:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// POST create new route (driver only)
router.post("/", authMiddleware, async (req, res) => {
	try {
		const { startLocation, endLocation, fare, availableSeats, vehicleNumber } =
			req.body;

		const route = new Route({
			driverId: req.userId,
			startLocation,
			endLocation,
			fare,
			availableSeats,
			vehicleNumber,
			isActive: true,
		});

		const newRoute = await route.save();
		res.status(201).json(newRoute);
	} catch (err) {
		console.error(err);
		res.status(400).json({ message: err.message });
	}
});

// Optional: update route status (e.g. mark as completed)
router.put("/:id", authMiddleware, async (req, res) => {
	try {
		const route = await Route.findById(req.params.id);
		if (!route) return res.status(404).json({ message: "Route not found" });

		if (route.driverId.toString() !== req.userId) {
			return res.status(403).json({ message: "Not authorized" });
		}

		if (req.body.isActive !== undefined) route.isActive = req.body.isActive;
		if (req.body.availableSeats !== undefined)
			route.availableSeats = req.body.availableSeats;

		await route.save();
		res.json(route);
	} catch (err) {
		res.status(400).json({ message: err.message });
	}
});

module.exports = router;
