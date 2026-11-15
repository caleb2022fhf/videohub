
const {
    verifySession,
    getSessionToken
} = require("../lib/auth");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const token = getSessionToken(req);
    const session = verifySession(token);

    if (!session) {
        return res.status(401).json({
            authenticated: false,
            error: "Not authenticated"
        });
    }

    if (
        session.email.trim().toLowerCase() !==
        (process.env.ADMIN_EMAIL || "").trim().toLowerCase()
    ) {
        return res.status(401).json({
            authenticated: false,
            error: "Invalid admin session"
        });
    }

    return res.status(200).json({
        authenticated: true,
        email: session.email
    });
};
