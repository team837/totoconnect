const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const verifyToken = require("../authMiddleware");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction"); // ← ADD THIS

const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const crypto = require("crypto"); // Built-in for PKCE/state
const { sendResetEmail } = require("../utils/sendResetEmail");
const UserOTP = require("../models/UserOTP");
const { sendOTPEmail } = require("../utils/sendOTPEmail");
const { sendWelcomeEmail } = require("../utils/sendWelcomeEmail");

// Helper: retry on timeout / transient network errors
async function exchangeCodeWithRetry(code, maxRetries = 3) {
	let lastError;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			//   console.log(`[Google Token Exchange] Attempt ${attempt}/${maxRetries}`);
			const { tokens } = await googleClient.getToken({ code });
			return tokens; // success → return the tokens object
		} catch (err) {
			lastError = err;

			// Only retry on timeout / connection errors
			const isRetryable =
				err.code === "ETIMEDOUT" ||
				err.code === "ECONNRESET" ||
				err.code === "ECONNREFUSED" ||
				(err.message && err.message.includes("connect ETIMEDOUT")) ||
				(err.message && err.message.includes("socket hang up"));

			if (!isRetryable || attempt === maxRetries) {
				throw err; // final attempt failed → let caller handle
			}

			const delayMs = 2000 * attempt; // exponential backoff: 2s → 4s → 6s...
			//   console.log(
			//     `[Google Token Exchange] Retryable error on attempt ${attempt}: ${err.code || err.message}. Retrying in ${delayMs}ms...`
			//   );
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	// Should not reach here, but just in case
	throw lastError || new Error("All retry attempts failed");
}

// GET /api/auth/referral-stats
router.get("/referral-stats", verifyToken, async (req, res) => {
	try {
		const totalReferrals = await User.countDocuments({
			referredBy: req.userId,
		});
		const totalEarnings = totalReferrals * 100; // ₹100 per referral

		res.json({
			referralCode: `toto99-${req.userId}`,
			totalReferrals,
			totalEarnings,
		});
	} catch (err) {
		res.status(500).json({ message: "Server error" });
	}
});

// POST /api/auth/send-signup-otp
router.post("/send-signup-otp", async (req, res) => {
	try {
		const { email } = req.body;

		if (!email) {
			return res.status(400).json({ message: "Email is required" });
		}

		// Check if user already exists
		const existingUser = await User.findOne({ email: email.toLowerCase() });
		if (existingUser) {
			return res.status(400).json({ message: "User already exists with this email" });
		}

		// Generate 6-digit OTP
		const otp = Math.floor(100000 + Math.random() * 900000).toString();

		// Upsert OTP (update if exists, else create)
		await UserOTP.findOneAndUpdate(
			{ email: email.toLowerCase() },
			{ otp, createdAt: Date.now() },
			{ upsert: true, new: true }
		);

		// Send Email
		const emailSent = await sendOTPEmail(email, otp);

		if (!emailSent) {
			return res.status(500).json({ message: "Failed to send verification email" });
		}

		res.json({ message: "Verification code sent to your email" });
	} catch (err) {
		console.error("Send OTP error:", err);
		res.status(500).json({ message: "Server error" });
	}
});

// Register
// POST /api/auth/register
router.post("/register", async (req, res) => {
	try {
		const {
			email,
			password,
			displayName,
			fullName,
			language,
			role = "user",
			driverDetails,
			referralCode,
			otp,
		} = req.body;

		if (!otp) {
			return res.status(400).json({ message: "Verification code is required" });
		}

		// Verify OTP
		const otpRecord = await UserOTP.findOne({ email: email.toLowerCase(), otp });
		if (!otpRecord) {
			return res.status(400).json({ message: "Invalid or expired verification code" });
		}

		// Check if user exists
		let user = await User.findOne({ email });
		if (user) {
			return res.status(400).json({ message: "User already exists" });
		}

		// Hash password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		// Create user
		user = new User({
			email,
			password: hashedPassword,
			fullName: fullName || displayName || email.split("@")[0],
			displayName: displayName || email.split("@")[0],
			language: language || "en",
			role,
			driverDetails: role === "driver" ? driverDetails : undefined,
			authProvider: "email",
			privacyPolicyAgreed: true,
			privacyPolicyAgreedAt: new Date(),
		});

		let referrer = null;
		let newUserBonus = 0;
		let referrerBonus = 0;

		// === Referral Logic ===
		if (referralCode && referralCode.startsWith("toto99-")) {
			const referrerId = referralCode.replace("toto99-", "");

			if (!mongoose.Types.ObjectId.isValid(referrerId)) {
				return res.status(400).json({ message: "Invalid referral code" });
			}

			referrer = await User.findById(referrerId);
			if (!referrer) {
				return res.status(400).json({ message: "Invalid referral code" });
			}

			if (referrer.email === email) {
				return res.status(400).json({ message: "You cannot refer yourself" });
			}

			user.referredBy = referrer._id;
			newUserBonus = 50;
			referrerBonus = 100;
		}

		// Create wallet with bonus (if any)
		const wallet = new Wallet({
			user: user._id,
			balance: newUserBonus,
			currency: "INR",
		});
		await wallet.save();

		user.walletId = wallet._id;
		await user.save();

		// === Send Welcome Email ===
		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
		const completeLink = `${frontendUrl}/settings`;
		await sendWelcomeEmail(user.email, completeLink);

		// Delete OTP record after successful registration
		await UserOTP.deleteOne({ _id: otpRecord._id });

		// === Transaction for New User (Referral Reward) ===
		if (newUserBonus > 0) {
			const transaction = new Transaction({
				wallet: wallet._id,
				type: "referral",
				amount: newUserBonus,
				description: "Welcome bonus for signing up with referral code",
				status: "completed",
			});
			await transaction.save();
		}

		// === Credit Referrer + Transaction ===
		if (referrer) {
			const referrerWallet = await Wallet.findOneAndUpdate(
				{ user: referrer._id },
				{ $inc: { balance: referrerBonus } },
				{ new: true },
			);

			const referrerTransaction = new Transaction({
				wallet: referrerWallet._id,
				type: "referral",
				amount: referrerBonus,
				description: `Referral bonus: ${user.displayName} joined using your code`,
				status: "completed",
			});
			await referrerTransaction.save();
		}

		// Generate JWT
		const token = jwt.sign(
			{ userId: user.id },
			process.env.JWT_SECRET || "secret",
			{ expiresIn: "7d" },
		);

		res.status(201).json({
			token,
			user: {
				id: user.id,
				email: user.email,
				fullName: user.fullName,
				displayName: user.displayName,
				walletId: user.walletId,
				role: user.role,
				referralCode: `toto99-${user.id}`,
				points: user.points,
				photoURL: user.photoURL,
				phoneNumber: user.phoneNumber,
				address: user.address,
				isVerified: user.isVerified,
			},
			message: referrer
				? `Welcome! ₹${newUserBonus} added as referral bonus!`
				: "Account created successfully!",
		});
	} catch (err) {
		console.error("Register error:", err);
		res.status(500).json({ message: "Server error" });
	}
});

// Login
router.post("/login", async (req, res) => {
	try {
		const { email, password } = req.body;

		// Check user
		const user = await User.findOne({ email });
		if (!user) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

		// New: Check if user is OAuth-only (no password)
		if (user.authProvider === "google" && !password) {
			return res.status(400).json({ message: "Please sign in with Google." });
		}

		// Existing password check (skipped implicitly for OAuth, but since they won't hit this route with password, it's fine)
		if (user.authProvider === "email") {
			// Only check password for email users
			const isMatch = await bcrypt.compare(password, user.password);
			if (!isMatch) {
				return res.status(400).json({ message: "Invalid credentials" });
			}
		}

		// Check password
		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

		// Create JWT
		const payload = { userId: user.id };
		const token = jwt.sign(payload, process.env.JWT_SECRET || "secret", {
			expiresIn: "7d",
		});

		res.json({
			token,
			user: {
				id: user.id,
				email: user.email,
				fullName: user.fullName,
				displayName: user.displayName,
				walletId: user.walletId,
				bio: user.bio,
				role: user.role,
				referralCode: `toto99-${user.id}`,
				points: user.points,
				photoURL: user.photoURL,
				phoneNumber: user.phoneNumber,
				address: user.address,
				isVerified: user.isVerified,
			},
		});
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server error");
	}
});

// Get Current User
router.get("/me", verifyToken, async (req, res) => {
	try {
		const user = await User.findById(req.userId).select("-password");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const userObj = user.toObject();
		userObj.id = userObj._id;

		res.json(userObj);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server error");
	}
});

// Initialize Google client (only once)
const googleClient = new OAuth2Client(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	`${process.env.BACKEND_URL || "http://localhost:5000"
	}/api/auth/google/callback`,
);

// Helper: generate signed state
function generateSignedState() {
	const nonce = crypto.randomBytes(32).toString("hex");
	const hmac = crypto
		.createHmac("sha256", process.env.JWT_SECRET || "secret") // use a strong secret
		.update(nonce)
		.digest("hex");
	return `${nonce}.${hmac}`;
}

// Helper: verify signed state
function verifySignedState(signedState) {
	if (!signedState) return false;
	const [nonce, receivedHmac] = signedState.split(".");
	if (!nonce || !receivedHmac) return false;

	const expectedHmac = crypto
		.createHmac("sha256", process.env.JWT_SECRET || "secret")
		.update(nonce)
		.digest("hex");

	return receivedHmac === expectedHmac;
}

// GET /api/auth/google
router.get("/google", (req, res) => {
	const state = generateSignedState();

	// 	console.log("[Google Init] Generated signed state:", state);

	const authUrl = googleClient.generateAuthUrl({
		access_type: "offline",
		scope: ["openid", "email", "profile"],
		state,
	});

	// 	console.log("[Google Init] Redirecting to:", authUrl);
	res.redirect(authUrl);
});

// GET /api/auth/google/callback
router.get("/google/callback", async (req, res) => {
	const { code, state, error } = req.query;

	if (error || !code) {
		return res.redirect(
			`${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
		);
	}

	//   console.log("[Google Callback] Received state:", state);

	if (!verifySignedState(state)) {
		console.warn("[Google Callback] Invalid signed state");
		return res.redirect(
			`${process.env.FRONTEND_URL}/login?error=invalid_state`,
		);
	}

	try {
		// ── Use retry wrapper here ──
		const tokens = await exchangeCodeWithRetry(code.toString(), 10);

		// Verify ID token and get user info
		const ticket = await googleClient.verifyIdToken({
			idToken: tokens.id_token,
			audience: process.env.GOOGLE_CLIENT_ID,
		});

		const payload = ticket.getPayload();
		if (!payload?.email_verified) {
			throw new Error("Google email not verified");
		}

		const {
			email,
			name: fullName,
			given_name: displayName,
			picture: photoURL,
		} = payload;

		// Check if user already exists
		let user = await User.findOne({ email });

		if (user) {
			// ── Existing user ── login directly
			const token = jwt.sign(
				{ userId: user.id },
				process.env.JWT_SECRET || "secret",
				{ expiresIn: "7d" },
			);

			const redirectUrl = `${process.env.FRONTEND_URL
				}/login?oauth=true&token=${encodeURIComponent(token)}`;

			return res.redirect(redirectUrl);
		}

		// ── NEW USER ── create short-lived consent token
		const consentPayload = {
			email,
			fullName: fullName || email.split("@")[0],
			displayName: displayName || fullName || email.split("@")[0],
			photoURL: photoURL || null,
			authProvider: "google",
			consentPurpose: "first_time_signup",
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + 60 * 15, // 15 minutes
		};

		const tempToken = jwt.sign(
			consentPayload,
			process.env.JWT_SECRET || "secret",
		);

		// Redirect to consent page
		const consentUrl = `${process.env.FRONTEND_URL
			}/google-consent?token=${encodeURIComponent(tempToken)}`;

		return res.redirect(consentUrl);
	} catch (err) {
		console.error("Google OAuth error:", err);
		console.error("Google OAuth error details:", {
			message: err.message,
			stack: err.stack,
			response: err.response?.data,
		});

		const message = encodeURIComponent(err.message || "Authentication failed");
		res.redirect(
			`${process.env.FRONTEND_URL}/login?error=oauth_failed&message=${message}`,
		);
	}
});

// POST /api/auth/google/register
router.post("/google/register", async (req, res) => {
	const { tempToken } = req.body;

	if (!tempToken) {
		return res.status(400).json({ message: "Missing consent token" });
	}

	try {
		// Verify the short-lived token
		const payload = jwt.verify(tempToken, process.env.JWT_SECRET || "secret");

		if (payload.consentPurpose !== "first_time_signup") {
			return res.status(403).json({ message: "Invalid token purpose" });
		}

		const { email, fullName, displayName, photoURL, authProvider } = payload;

		// Double-check: user should not exist yet
		let user = await User.findOne({ email });
		if (user) {
			// Race condition — user was created meanwhile → just log in
			const loginToken = jwt.sign(
				{ userId: user.id },
				process.env.JWT_SECRET || "secret",
				{ expiresIn: "7d" },
			);

			return res.json({
				token: loginToken,
				user: {
					id: user.id,
					email: user.email,
					fullName: user.fullName,
					displayName: user.displayName,
					walletId: user.walletId,
					role: user.role,
					referralCode: `toto99-${user.id}`,
					points: user.points,
					photoURL: user.photoURL,
				},
			});
		}

		// Create new user
		user = new User({
			email,
			fullName,
			displayName,
			photoURL,
			language: "en",
			role: "user",
			authProvider: "google",
			privacyPolicyAgreed: true,
			privacyPolicyAgreedAt: new Date(),
		});

		// Create wallet (same as in /register)
		const wallet = new Wallet({
			user: user._id,
			balance: 0,
			currency: "INR",
		});

		await wallet.save();
		user.walletId = wallet._id;

		await user.save();

		// Generate real session token
		const token = jwt.sign(
			{ userId: user.id },
			process.env.JWT_SECRET || "secret",
			{ expiresIn: "7d" },
		);

		// Return same shape as /register
		res.status(201).json({
			token,
			user: {
				id: user.id,
				email: user.email,
				fullName: user.fullName,
				displayName: user.displayName,
				walletId: user.walletId,
				role: user.role,
				referralCode: `toto99-${user.id}`,
				points: user.points,
				photoURL: user.photoURL,
				phoneNumber: user.phoneNumber,
				address: user.address,
				isVerified: user.isVerified,
			},
			message: "Account created successfully!",
		});
	} catch (err) {
		if (err.name === "TokenExpiredError") {
			return res.status(401).json({
				message: "Consent link expired. Please sign in with Google again.",
			});
		}
		if (err.name === "JsonWebTokenError") {
			return res.status(401).json({ message: "Invalid consent token" });
		}

		console.error("Google register error:", err);
		res.status(500).json({ message: "Server error during account creation" });
	}
});

router.post("/forgot-password", async (req, res) => {
	const { email } = req.body;
	console.log("[Forgot Password] Request for email:", email);

	if (!email) {
		return res.status(400).json({ message: "Email is required" });
	}

	try {
		const user = await User.findOne({ email: email.toLowerCase() });

		console.log("[Forgot Password] User found:", user);

		// Always return success (security)
		if (!user) {
			return res.status(200).json({
				message:
					"If an account exists, you will receive a password reset link.",
			});
		}

		// 1. Generate secure token
		const resetToken = crypto.randomBytes(32).toString("hex");

		// 2. Save to user with expiration (20 minutes)
		user.resetPasswordToken = resetToken;
		user.resetPasswordExpires = Date.now() + 20 * 60 * 1000; // 20 minutes

		await user.save();

		// 3. Create reset link
		// Change to your actual frontend URL!
		const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
		const resetLink = `${frontendUrl}/reset_password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

		// 4. Send email
		const emailSent = await sendResetEmail(user.email, resetLink);

		if (!emailSent) {
			console.warn("Failed to send reset email but user exists");
			// still return success - don't expose failure to user
		}

		return res.status(200).json({
			message: "If an account exists, you will receive a password reset link.",
		});
	} catch (error) {
		console.error("Forgot password error:", error);
		return res.status(500).json({ message: "Server error. Try again later." });
	}
});

// Add this route (preferably in authRoutes.js)
router.post("/reset-password", async (req, res) => {
	const { email, token, newPassword } = req.body;

	if (!email || !token || !newPassword) {
		return res.status(400).json({ message: "Missing required fields" });
	}

	if (newPassword.length < 8) {
		return res
			.status(400)
			.json({ message: "Password must be at least 8 characters" });
	}

	try {
		const user = await User.findOne({
			email: email.toLowerCase().trim(),
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: Date.now() }, // still valid
		});

		if (!user) {
			return res.status(400).json({
				message: "Invalid or expired reset token. Please request a new one.",
			});
		}

		const salt = await bcrypt.genSalt(10);
		user.password = await bcrypt.hash(newPassword, salt);

		// Clear reset fields
		user.resetPasswordToken = null;
		user.resetPasswordExpires = null;

		await user.save();

		return res.status(200).json({ message: "Password reset successful" });
	} catch (error) {
		console.error("Reset password error:", error);
		return res.status(500).json({ message: "Server error. Try again later." });
	}
});

// POST /api/auth/update-points
router.post("/update-points", verifyToken, async (req, res) => {
	try {
		const { point } = req.body;

		if (point === undefined) {
			return res.status(400).json({ message: "Points value is required" });
		}

		// Update points first
		let user = await User.findByIdAndUpdate(
			req.userId,
			{ $set: { points: point } },
			{ new: true }
		);

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Calculate global rank: (number of users with more points than me) + 1
		const higherPointCount = await User.countDocuments({ points: { $gt: point } });
		const globalRank = higherPointCount + 1;

		// Update global_rank
		user = await User.findByIdAndUpdate(
			req.userId,
			{ $set: { global_rank: globalRank } },
			{ new: true }
		).select("-password");

		res.json({
			message: "Points and rank updated successfully",
			points: user.points,
			global_rank: user.global_rank,
		});
	} catch (err) {
		console.error("Update points error:", err);
		res.status(500).json({ message: "Server error" });
	}
});

// POST /api/auth/point-details
router.post("/point-details", async (req, res) => {
	try {
		const { email, id, role } = req.body;

		if (!email || !id || !role) {
			return res.status(400).json({ message: "Missing required fields: email, userid, role" });
		}

		const user = await User.findById(id);

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Optional: Verify email and role match if needed for security
		if (user.email.toLowerCase() !== email.toLowerCase()) {
			return res.status(403).json({ message: "Email does not match user ID" });
		}

		res.json({
			points: user.points || 0,
			global_rank: user.global_rank || 0,
			daily_streak: user.daily_streak || 0,
			est_value: user.est_value || 0,
		});
	} catch (err) {
		console.error("Point details error:", err);
		res.status(500).json({ message: "Server error" });
	}
});

module.exports = router;
