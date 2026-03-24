const sgMail = require("@sendgrid/mail");
const fs = require("fs");
const path = require("path");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendOTPEmail(userEmail, otpCode) {
    try {
        const templatePath = path.join(
            __dirname,
            "../email_template/Verify_OTP.html",
        );
        let htmlTemplate = fs.readFileSync(templatePath, "utf8");

        htmlTemplate = htmlTemplate.replace("[OTP_CODE]", otpCode);

        const msg = {
            to: userEmail,
            from: {
                email: process.env.EMAIL_FROM,
                name: "Toto99blog Team",
            },
            subject: `${otpCode} is your verification code for Toto99blog`,
            text: `Your verification code is ${otpCode}. It expires in 10 minutes.`,
            html: htmlTemplate,
        };

        await sgMail.send(msg);
        return true;
    } catch (error) {
        console.error("SendGrid OTP error:", error?.response?.body || error.message);
        return false;
    }
}

module.exports = { sendOTPEmail };
