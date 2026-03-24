// utils/sendResetEmail.js
const sgMail = require("@sendgrid/mail");
const fs = require("fs");
const path = require("path");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendResetEmail(userEmail, resetLink) {
	try {
		const templatePath = path.join(
			__dirname,
			"../email_template/Reset_Password.html",
		);
		let htmlTemplate = fs.readFileSync(templatePath, "utf8");

		// console.log("Original link to replace:", resetLink); // ← add
		htmlTemplate = htmlTemplate.replace("[Reset_Link]", resetLink);
		// console.log("After replacement :", htmlTemplate); // ← add this!
		const msg = {
			to: userEmail,
			from: {
				email: process.env.EMAIL_FROM, // ← must be verified in SendGrid
				name: "Toto99blog Team",
			},
			subject: "Reset Your Toto99blog Password",
			text: `Click here to reset your password (expires in 20 min): ${resetLink}`, // plain text fallback
			html: htmlTemplate,
		};

		const response = await sgMail.send(msg);
		// console.log("Reset email sent → status:", response[0]?.statusCode);

		return true;
	} catch (error) {
		console.error("SendGrid error:", error?.response?.body || error.message);
		return false;
	}
}

module.exports = { sendResetEmail };
