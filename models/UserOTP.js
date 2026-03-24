const mongoose = require("mongoose");

const userOTPSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    otp: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600, // OTP expires in 10 minutes (600 seconds)
    },
});

module.exports = mongoose.model("UserOTP", userOTPSchema);
