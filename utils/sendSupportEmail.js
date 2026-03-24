const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendSupportEmail({ userEmail, subject, message }) {
    try {
        const msg = {
            to: 'support@toto99blog.com',
            from: {
                email: process.env.EMAIL_FROM || 'support@toto99blog.com',
                name: "Toto99blog Support System",
            },
            replyTo: userEmail,
            subject: `Support Query: ${subject}`,
            text: `Support request from: ${userEmail}\n\nSubject: ${subject}\n\nMessage:\n${message}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">New Support Inquiry</h2>
                    <p><strong>From:</strong> ${userEmail}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 20px;">
                        <p style="white-space: pre-wrap;">${message}</p>
                    </div>
                </div>
            `,
        };

        await sgMail.send(msg);
        return true;
    } catch (error) {
        console.error("SendGrid Support email error:", error?.response?.body || error.message);
        return false;
    }
}

module.exports = { sendSupportEmail };
