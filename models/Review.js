// models/Review.js
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},
	driverId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User", // Both user and driver are in the same User collection
		required: true,
	},
	rating: {
		type: Number,
		required: true,
		min: 1,
		max: 5,
	},
	comment: {
		type: String,
		required: true,
		trim: true,
		minlength: 5,
		maxlength: 500,
	},
	bookingId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Booking",
		required: true,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
});

// One review per booking
reviewSchema.index({ userId: 1, driverId: 1, bookingId: 1 }, { unique: true });

const Review = mongoose.model("Review", reviewSchema);

// Drop the old index if it exists to allow multiple reviews per driver (for different bookings)
Review.collection.dropIndex("userId_1_driverId_1").catch((err) => {
	// Ignore error if index doesn't exist
	if (err.code !== 27) {
		console.warn("Could not drop old index:", err.message);
	}
});

module.exports = Review;
