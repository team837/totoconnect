const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startLocation: { type: String, required: true },
    endLocation: { type: String, required: true },
    fare: { type: Number, required: true },
    availableSeats: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    postedAt: { type: Date, default: Date.now },
    vehicleNumber: String
});

module.exports = mongoose.model('Route', routeSchema);
