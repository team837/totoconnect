const sgMail = require("@sendgrid/mail");
const fs = require("fs");
const path = require("path");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendWelcomeEmail(userEmail, completeLink) {
    try {
        const templatePath = path.join(
            __dirname,
            "../email_template/complete_profile_mail.html",
        );
        let htmlTemplate = fs.readFileSync(templatePath, "utf8");

        // Replacement link for the button
        htmlTemplate = htmlTemplate.replace('href="www.toto99blog.com"', `href="${completeLink}?tab=account"`);

        const msg = {
            to: userEmail,
            from: {
                email: process.env.EMAIL_FROM,
                name: "Toto99blog Team",
            },
            subject: "Welcome to Toto99blog - Complete Your Profile",
            text: `Welcome to TotoConnect! Please complete your profile here: ${completeLink}`,
            html: htmlTemplate,
        };

        await sgMail.send(msg);
        return true;
    } catch (error) {
        console.error("SendGrid Welcome Email error:", error?.response?.body || error.message);
        return false;
    }
}

module.exports = { sendWelcomeEmail };
