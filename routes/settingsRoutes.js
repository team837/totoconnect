// routes/settingsRoutes.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const verifyToken = require("../authMiddleware");
const bcrypt = require("bcryptjs");

// Protect all settings routes
router.use(verifyToken);

// PUT /api/settings/profile - Update name, username (displayName), bio, photo
router.put("/profile", async (req, res) => {
	try {
		const { fullName, displayName, bio, photoURL, phoneNumber, address } = req.body;

		const user = await User.findById(req.userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (fullName !== undefined) user.fullName = fullName;
		if (displayName !== undefined) user.displayName = displayName;
		if (bio !== undefined) user.bio = bio || "";
		if (photoURL !== undefined) user.photoURL = photoURL || "";
		if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
		if (address !== undefined) user.address = address;

		await user.save();

		res.json({
			message: "Profile updated successfully",
			user: {
				id: user._id,
				fullName: user.fullName,
				displayName: user.displayName,
				email: user.email,
				photoURL: user.photoURL,
				bio: user.bio,
				walletId: user.walletId,
				language: user.language,
				userType: user.role === "driver" ? "driver" : "passenger",
			},
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// PUT /api/settings/password - Change password
router.put("/password", async (req, res) => {
	try {
		const { currentPassword, newPassword } = req.body;

		if (!currentPassword || !newPassword) {
			return res.status(400).json({ message: "Both passwords are required" });
		}

		const user = await User.findById(req.userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Check current password
		const isMatch = await bcrypt.compare(currentPassword, user.password);
		if (!isMatch) {
			return res.status(400).json({ message: "Current password is incorrect" });
		}

		// Hash new password
		const salt = await bcrypt.genSalt(10);
		user.password = await bcrypt.hash(newPassword, salt);

		await user.save();

		res.json({ message: "Password changed successfully" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// PUT /api/settings/notifications - Toggle push notifications (optional field)
router.put("/notifications", async (req, res) => {
	try {
		const { pushNotifications } = req.body;

		const user = await User.findByIdAndUpdate(
			req.userId,
			{ pushNotifications: pushNotifications === true }, // coerce to boolean
			{ new: true, upsert: false }
		);

		res.json({
			message: "Notification settings updated",
			pushNotifications: user.pushNotifications,
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

// DELETE /api/settings/account - Delete account permanently
router.delete("/account", async (req, res) => {
	try {
		const { password } = req.body; // Require password confirmation

		if (!password) {
			return res
				.status(400)
				.json({ message: "Password is required to delete account" });
		}

		const user = await User.findById(req.userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return res.status(400).json({ message: "Incorrect password" });
		}

		await User.deleteOne({ _id: req.userId });

		res.json({ message: "Account deleted permanently" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Server error" });
	}
});

module.exports = router;
