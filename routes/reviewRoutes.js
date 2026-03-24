// routes/reviewRoutes.js
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const User = require("../models/User");
const Booking = require("../models/Booking");
const verifyToken = require("../authMiddleware");

// GET all reviews for a specific driver (public)
router.get("/", async (req, res) => {
	try {
		const { driverId } = req.query;

		if (!driverId) {
			return res
				.status(400)
				.json({ message: "driverId query parameter is required" });
		}

		const reviews = await Review.find({ driverId })
			.populate("userId", "displayName photoURL")
			.populate("driverId", "displayName photoURL")
			.sort({ createdAt: -1 });

		res.json(reviews);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// POST - Submit a review (only authenticated users)
router.post("/", verifyToken, async (req, res) => {
	try {
		const { driverId, bookingId, rating, comment } = req.body;

		if (!driverId || !bookingId || !rating || !comment) {
			return res
				.status(400)
				.json({ message: "driverId, bookingId, rating and comment are required" });
		}

		if (rating < 1 || rating > 5) {
			return res
				.status(400)
				.json({ message: "Rating must be between 1 and 5" });
		}

		// Prevent self-review
		if (req.userId.toString() === driverId) {
			return res.status(400).json({ message: "You cannot review yourself" });
		}

		// Optional: Only allow review if driver actually exists and has role "driver"
		const driver = await User.findById(driverId);
		if (!driver) return res.status(404).json({ message: "Driver not found" });
		if (driver.role !== "driver") {
			return res.status(400).json({ message: "You can only review drivers" });
		}

		const review = new Review({
			userId: req.userId,
			driverId,
			bookingId,
			rating: Number(rating),
			comment: comment.trim(),
		});

		const savedReview = await review.save();

		// Mark booking as reviewed
		await Booking.findByIdAndUpdate(bookingId, { isReviewed: true });

		const populated = await Review.findById(savedReview._id)
			.populate("userId", "displayName photoURL")
			.populate("driverId", "displayName photoURL");

		res.status(201).json(populated);
	} catch (err) {
		if (err.code === 11000) {
			return res
				.status(400)
				.json({ message: "You have already reviewed this ride" });
		}
		console.error(err);
		res.status(400).json({ message: err.message || "Failed to submit review" });
	}
});

// BONUS: Get driver stats (average rating + count)
router.get("/stats/:driverId", async (req, res) => {
	try {
		const stats = await Review.aggregate([
			{
				$match: { driverId: new mongoose.Types.ObjectId(req.params.driverId) },
			},
			{
				$group: {
					_id: null,
					averageRating: { $avg: "$rating" },
					totalReviews: { $sum: 1 },
				},
			},
		]);

		res.json({
			averageRating: stats[0]?.averageRating?.toFixed(1) || "0.0",
			totalReviews: stats[0]?.totalReviews || 0,
		});
	} catch (err) {
		res.status(500).json({ message: "Server error" });
	}
});

module.exports = router;
