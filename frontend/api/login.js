
const crypto = require("crypto");
const {
    createSession,
    setSessionCookie
} = require("../lib/auth");

function safeCompare(a, b) {
    const first = Buffer.from(a);
    const second = Buffer.from(b);

    if (first.length !== second.length) return false;

    return crypto.timingSafeEqual(first, second);
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const sessionSecret = process.env.SESSION_SECRET;

    if (!adminEmail || !adminPassword || !sessionSecret) {
        return res.status(500).json({
            error: "Server authentication is not configured."
        });
    }

    const { email, password } = req.body || {};

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 254 ||
        password.length > 1024
    ) {
        return res.status(400).json({
            error: "Please enter valid login details."
        });
    }

    const emailMatches = safeCompare(
        email.trim().toLowerCase(),
        adminEmail.trim().toLowerCase()
    );

    const passwordMatches = safeCompare(
        password,
        adminPassword
    );

    if (!emailMatches || !passwordMatches) {
        return res.status(401).json({
            error: "Incorrect email or password."
        });
    }

    const token = createSession(adminEmail);

    setSessionCookie(res, token);

    return res.status(200).json({
        success: true,
        message: "Login successful."
    });
};
