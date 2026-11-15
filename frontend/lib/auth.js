
const crypto = require("crypto");

const COOKIE_NAME = "videohub_admin_session";
const SESSION_DURATION = 8 * 60 * 60;

function createSession(email) {
    const payload = Buffer.from(JSON.stringify({
        email,
        expires: Math.floor(Date.now() / 1000) + SESSION_DURATION
    })).toString("base64url");

    const signature = crypto
        .createHmac("sha256", process.env.SESSION_SECRET)
        .update(payload)
        .digest("base64url");

    return `${payload}.${signature}`;
}

function verifySession(token) {
    if (!token || !process.env.SESSION_SECRET) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payload, signature] = parts;

    const expected = crypto
        .createHmac("sha256", process.env.SESSION_SECRET)
        .update(payload)
        .digest();

    let received;

    try {
        received = Buffer.from(signature, "base64url");
    } catch {
        return null;
    }

    if (
        received.length !== expected.length ||
        !crypto.timingSafeEqual(received, expected)
    ) return null;

    try {
        const data = JSON.parse(
            Buffer.from(payload, "base64url").toString()
        );

        if (!data.email || data.expires < Math.floor(Date.now() / 1000)) {
            return null;
        }

        return data;
    } catch {
        return null;
    }
}

function getSessionToken(req) {
    const cookies = (req.headers.cookie || "").split(";");

    for (const cookie of cookies) {
        const [name, ...value] = cookie.trim().split("=");

        if (name === COOKIE_NAME) {
            return decodeURIComponent(value.join("="));
        }
    }

    return null;
}

function setSessionCookie(res, token) {
    res.setHeader("Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION}`
    );
}

function clearSessionCookie(res) {
    res.setHeader("Set-Cookie",
        `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
    );
}

module.exports = {
    createSession,
    verifySession,
    getSessionToken,
    setSessionCookie,
    clearSessionCookie
};
