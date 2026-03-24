const express = require("express");
const router = express.Router();
const { sendSupportEmail } = require("../utils/sendSupportEmail");

router.post("/contact", async (req, res) => {
    const { email, subject, message } = req.body;

    if (!email || !subject || !message) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const success = await sendSupportEmail({ userEmail: email, subject, message });

    if (success) {
        res.status(200).json({ message: "Your message has been sent successfully. Our support team will get back to you soon." });
    } else {
        res.status(500).json({ message: "Failed to send your message. Please try again later." });
    }
});

module.exports = router;
