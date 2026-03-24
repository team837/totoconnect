const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
	displayName: String,
	fullName: String,
	email: String,
	photoURL: String,
	bio: String,
	lastLogin: Date,
	mongoData: String,
	walletId: String,
	password: { type: String, required: false },
	language: { type: String, default: "en" },
	createdAt: { type: Date, default: Date.now },
	points: { type: Number, default: 0 },
	global_rank: { type: Number, default: 0 },
	daily_streak: { type: Number, default: 0 },
	est_value: { type: Number, default: 0 },
	authProvider: { type: String, enum: ["email", "google"], default: "email" }, // ← New: Track login method
	role: {
		type: String,
		enum: ["user", "driver", "admin"],
		default: "user",
	},
	driverDetails: {
		licenseNumber: String,
		vehicleModel: String,
		vehicleNumber: String,
		experienceYears: Number,
	},
	location: {
		type: { type: String, enum: ["Point"], default: "Point" },
		coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
	},
	isAvailable: { type: Boolean, default: false },

	referredBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
	},
	privacyPolicyAgreed: {
		type: Boolean,
		default: false,
	},
	privacyPolicyAgreedAt: {
		type: Date,
		default: null,
	},

	resetPasswordToken: {
		type: String,
		default: null,
	},
	resetPasswordExpires: {
		type: Date,
		default: null,
	},

	phoneNumber: {
		type: String,
		default: null,
	},
	address: {
		type: String,
		default: null,
	},
	photos: {
		type: [String],
		default: [],
	},
}, {
	toJSON: { virtuals: true },
	toObject: { virtuals: true }
});

userSchema.virtual('isVerified').get(function () {
	return !!(this.fullName && this.displayName && this.phoneNumber && this.address);
});

module.exports = mongoose.model("User", userSchema);
