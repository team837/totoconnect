const express = require("express");
const router = express.Router();
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const PendingTransaction = require("../models/PendingTransaction");
const verifyToken = require("../authMiddleware");

// Cashfree Credentials
const CF_APP_ID = process.env.CF_APP_ID;
const CF_SECRET_KEY = process.env.CF_SECRET_KEY;
const CF_API_VERSION = "2023-08-01";
const CF_BASE_URL = "https://sandbox.cashfree.com/pg"; // Change to https://api.cashfree.com/pg for production
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// POST /api/payment/initiate - Create Cashfree order & return payment_session_id
router.post("/initiate", verifyToken, async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || Number(amount) < 50) {
            return res.status(400).json({ message: "Minimum amount is ₹50" });
        }

        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const orderId = `order_${uuidv4().replace(/-/g, "").substring(0, 12)}`;
        const amountFormatted = Number(Number(amount).toFixed(2));

        // Save pending transaction with the Cashfree order_id
        await PendingTransaction.create({
            txnid: orderId,
            user: req.userId,
            amount: amountFormatted,
            status: "pending",
        });

        // Create Cashfree order
        const cfResponse = await axios.post(
            `${CF_BASE_URL}/orders`,
            {
                order_id: orderId,
                order_amount: amountFormatted,
                order_currency: "INR",
                order_note: "Wallet Topup",
                customer_details: {
                    customer_id: String(req.userId),
                    customer_email: user.email.trim(),
                    customer_phone: user.phoneNumber || "9999999999",
                    customer_name: user.displayName || user.fullName || "User",
                },
                order_meta: {
                    return_url: ``,
                },
            },
            {
                headers: {
                    "x-client-id": CF_APP_ID,
                    "x-client-secret": CF_SECRET_KEY,
                    "x-api-version": CF_API_VERSION,
                    "Content-Type": "application/json",
                },
            }
        );

        res.json({
            payment_session_id: cfResponse.data.payment_session_id,
            order_id: orderId,
        });
    } catch (err) {
        console.error("Cashfree payment initiation error:", err?.response?.data || err);
        res.status(500).json({ message: "Server error" });
    }
});

// GET /api/payment/verify?order_id=... - Verify Cashfree payment & credit wallet
router.get("/verify", verifyToken, async (req, res) => {
    try {
        const { order_id } = req.query;

        if (!order_id) {
            return res.status(400).json({ message: "order_id is required" });
        }

        // Fetch order status from Cashfree
        const cfResponse = await axios.get(
            `${CF_BASE_URL}/orders/${order_id}`,
            {
                headers: {
                    "x-client-id": CF_APP_ID,
                    "x-client-secret": CF_SECRET_KEY,
                    "x-api-version": CF_API_VERSION,
                },
            }
        );

        const orderData = cfResponse.data;

        if (orderData.order_status !== "PAID") {
            return res.status(400).json({
                message: "Payment not completed",
                status: orderData.order_status,
            });
        }

        // Find pending transaction
        const pendingTx = await PendingTransaction.findOne({
            txnid: order_id,
            status: "pending",
        });

        if (!pendingTx) {
            // Already processed — return success silently
            return res.json({ message: "Payment already processed", status: "success" });
        }

        // Credit wallet
        const wallet = await Wallet.findOne({ user: pendingTx.user });
        if (!wallet) {
            return res.status(404).json({ message: "Wallet not found" });
        }

        wallet.balance += pendingTx.amount;
        await wallet.save();

        await Transaction.create({
            wallet: wallet._id,
            type: "deposit",
            amount: pendingTx.amount,
            description: `Added ₹${pendingTx.amount} via Cashfree (Order: ${order_id})`,
            status: "completed",
        });

        pendingTx.status = "success";
        await pendingTx.save();

        return res.json({
            message: "Payment verified and wallet credited",
            amount: pendingTx.amount,
            status: "success",
        });
    } catch (err) {
        console.error("Cashfree verify error:", err?.response?.data || err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
