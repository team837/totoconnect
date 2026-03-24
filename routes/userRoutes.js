const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid"); // Make sure to: npm install uuid

const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const PendingTransaction = require("../models/PendingTransaction"); // New model
const Booking = require("../models/Booking");
const verifyToken = require("../authMiddleware");
const uploadProfile = require("../middleware/uploadProfile");
const uploadPhotos = require("../middleware/uploadPhotos");


const BASE_URL = process.env.BASE_URL || "http://localhost:3000";


// GET /users/wallet - Get user wallet balance & points
router.get("/wallet", verifyToken, async (req, res) => {
	try {
		const user = await User.findById(req.userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		let wallet = await Wallet.findOne({ user: req.userId });
		if (!wallet) {
			wallet = new Wallet({ user: req.userId });
			await wallet.save();
			user.walletId = wallet._id;
			await user.save();
		}

		res.json({
			balance: wallet.balance.toFixed(2),
			currency: wallet.currency || "INR",
			walletId: wallet._id,
			points: user.points || 0,
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});


// POST /users/wallet/convert-points - Convert points to balance (20 points = ₹3)
router.post("/wallet/convert-points", verifyToken, async (req, res) => {
	try {
		const { pointsToConvert } = req.body;

		if (
			!pointsToConvert ||
			pointsToConvert < 20 ||
			pointsToConvert % 20 !== 0
		) {
			return res
				.status(400)
				.json({ message: "Minimum 20 points, multiples of 20 only" });
		}

		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		if ((user.points || 0) < pointsToConvert) {
			return res.status(400).json({ message: "Insufficient points" });
		}

		const amount = Number(((pointsToConvert * 3) / 20).toFixed(2));

		const wallet = await Wallet.findOne({ user: req.userId });
		if (!wallet) return res.status(404).json({ message: "Wallet not found" });

		user.points -= pointsToConvert;
		await user.save();

		wallet.balance += amount;
		await wallet.save();

		await Transaction.create({
			wallet: wallet._id,
			type: "deposit",
			amount,
			description: `Converted ${pointsToConvert} points to ₹${amount}`,
			status: "completed",
		});

		res.json({
			message: "Points converted successfully",
			points: user.points,
			balance: wallet.balance.toFixed(2),
			convertedAmount: amount,
		});
	} catch (err) {
		console.error("Points conversion error:", err);
		res.status(500).json({ message: "Server error" });
	}
});

// GET /users/wallet/transactions
router.get("/wallet/transactions", verifyToken, async (req, res) => {
	try {
		const wallet = await Wallet.findOne({ user: req.userId });
		if (!wallet) return res.status(404).json({ message: "Wallet not found" });

		const transactions = await Transaction.find({ wallet: wallet._id })
			.sort({ createdAt: -1 })
			.limit(20);

		res.json(transactions);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// PUT /users/me - Update profile
router.put("/me", verifyToken, async (req, res) => {
	try {
		const { displayName, username, bio, photoURL } = req.body;
		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		if (displayName) user.displayName = displayName;
		if (username) user.displayName = username;
		if (bio) user.bio = bio;
		if (photoURL) user.photoURL = photoURL;

		await user.save();

		res.json({
			message: "Profile updated successfully",
			user: {
				id: user._id,
				displayName: user.displayName,
				fullName: user.fullName,
				username: user.displayName,
				email: user.email,
				bio: user.bio,
				photoURL: user.photoURL,
				walletId: user.walletId,
			},
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// NEW: Upload profile picture
router.put("/me/photo", verifyToken, uploadProfile, async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ message: "No file uploaded" });
		}

		const photoURL = req.file.secure_url || req.file.path;

		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		// Optional: delete old photo from Cloudinary
		if (user.photoURL?.includes("res.cloudinary.com")) {
			try {
				const publicId = user.photoURL.split("/").pop().split(".")[0];
				const cloudinary = require("../config/cloudinary");
				await cloudinary.uploader.destroy(`toto/users/profiles/${publicId}`);
			} catch (e) {
				console.warn("Failed to delete old photo (non-critical)", e.message);
			}
		}

		user.photoURL = photoURL;
		await user.save();

		res.json({
			success: true,
			message: "Profile picture updated",
			photoURL,
		});
	} catch (err) {
		res.status(500).json({ message: "Server error" });
	}
});

// NEW: Upload a photo to the "Your Photos" collection
router.post("/me/photos", verifyToken, uploadPhotos, async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ message: "No file uploaded" });
		}

		const photoURL = req.file.secure_url || req.file.path;

		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		if (!user.photos) user.photos = [];
		user.photos.push(photoURL);
		await user.save();

		res.json({
			success: true,
			message: "Photo added successfully",
			photoURL,
			photos: user.photos,
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// NEW: Delete a photo from the "Your Photos" collection
router.delete("/me/photos/:index", verifyToken, async (req, res) => {
	try {
		const { index } = req.params;
		const user = await User.findById(req.userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		const idx = parseInt(index);
		if (isNaN(idx) || idx < 0 || idx >= (user.photos || []).length) {
			return res.status(400).json({ message: "Invalid photo index" });
		}

		const photoURL = user.photos[idx];

		// Optional: delete from Cloudinary
		if (photoURL && photoURL.includes("res.cloudinary.com")) {
			try {
				const publicId = photoURL.split("/").pop().split(".")[0];
				const cloudinary = require("../config/cloudinary");
				await cloudinary.uploader.destroy(`toto/users/photos/${publicId}`);
			} catch (e) {
				console.warn("Failed to delete photo from Cloudinary (non-critical)", e.message);
			}
		}

		user.photos.splice(idx, 1);
		await user.save();

		res.json({
			success: true,
			message: "Photo deleted successfully",
			photos: user.photos,
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// NEW: GET /users/:id - Get public profile of another user
router.get("/:id", verifyToken, async (req, res) => {
	try {
		const targetUser = await User.findById(req.params.id);
		if (!targetUser) {
			return res.status(404).json({ message: "User not found" });
		}

		// Check if there is a confirmed/completed booking between the two users
		const bookingExists = await Booking.findOne({
			$or: [
				{ passengerId: req.userId, driverId: targetUser._id },
				{ passengerId: targetUser._id, driverId: req.userId },
			],
			status: { $in: ["confirmed", "completed"] },
		});

		const response = {
			id: targetUser._id,
			displayName: targetUser.displayName,
			fullName: targetUser.fullName,
			email: targetUser.email,
			photoURL: targetUser.photoURL,
			bio: targetUser.bio,
			role: targetUser.role,
			photos: targetUser.photos || [],
			phoneNumber: bookingExists ? targetUser.phoneNumber : null,
			isVerified: !!(targetUser.fullName && targetUser.displayName && targetUser.phoneNumber && targetUser.address),
		};

		res.json(response);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

module.exports = router;




