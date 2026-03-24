const mongoose = require("mongoose");

const pendingTransactionSchema = new mongoose.Schema({
	txnid: { type: String, required: true, unique: true },
	user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	amount: { type: Number, required: true },
	status: {
		type: String,
		enum: ["pending", "success", "failed"],
		default: "pending",
	},
	createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PendingTransaction", pendingTransactionSchema);
