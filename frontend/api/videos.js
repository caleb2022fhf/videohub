
const { verifySession, getSessionToken } = require("../lib/auth");

function getSupabaseHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    return {
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    };
}

function validVideoId(id) {
    return typeof id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function validYouTubeUrl(value) {
    try {
        const url = new URL(value);

        if (![
            "youtube.com",
            "www.youtube.com",
            "youtu.be",
            "m.youtube.com"
        ].includes(url.hostname)) {
            return false;
        }

        let videoId = "";

        if (url.hostname === "youtu.be") {
            videoId = url.pathname.slice(1);
        } else if (url.pathname === "/watch") {
            videoId = url.searchParams.get("v") || "";
        } else {
            const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/);
            videoId = match ? match[2] : "";
        }

        return /^[a-zA-Z0-9_-]{11}$/.test(videoId);

    } catch {
        return false;
    }
}

function getYouTubeThumbnail(value) {
    try {
        const url = new URL(value);
        let videoId = "";

        if (url.hostname === "youtu.be") {
            videoId = url.pathname.slice(1);
        } else if (url.pathname === "/watch") {
            videoId = url.searchParams.get("v") || "";
        } else {
            const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/);
            videoId = match ? match[2] : "";
        }

        if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return null;
        }

        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    } catch {
        return null;
    }
}

// READ SUPABASE RESPONSE AND EXTRACT ERROR
async function readSupabaseResponse(response) {
    const raw = await response.text();

    let data;

    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        data = { message: raw || "Supabase returned an empty response." };
    }

    return {
        ok: response.ok,
        status: response.status,
        data
    };
}

// RETURN DETAILED ERROR WITHOUT SHOWING SECRET KEYS
function sendDatabaseError(res, operation, result) {
    const error = result.data || {};

    console.error("VIDEOHUB DATABASE DEBUG:", {
        operation,
        httpStatus: result.status,
        errorCode: error.code || "UNKNOWN",
        message: error.message || "Unknown database error",
        details: error.details || "",
        hint: error.hint || ""
    });

    return res.status(500).json({
        success: false,
        error: `Supabase failed during ${operation}.`,
        diagnostic: {
            operation,
            httpStatus: result.status,
            errorCode: error.code || "UNKNOWN",
            message: error.message || "No error message returned.",
            details: error.details || "",
            hint: error.hint || ""
        }
    });
}

module.exports = async function handler(req, res) {

    // CHECK ADMIN SESSION
    const token = getSessionToken(req);
    const session = verifySession(token);

    if (
        !session ||
        session.email.trim().toLowerCase() !==
        (process.env.ADMIN_EMAIL || "").trim().toLowerCase()
    ) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized. Please login again."
        });
    }

    // CHECK DATABASE CONFIGURATION
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({
            success: false,
            error: "Database configuration is missing.",
            diagnostic: {
                message: !supabaseUrl
                    ? "SUPABASE_URL is missing."
                    : "SUPABASE_SERVICE_ROLE_KEY is missing.",
                solution: "Check Vercel Environment Variables."
            }
        });
    }

    const baseUrl = supabaseUrl.replace(/\/+$/, "");
    const headers = getSupabaseHeaders();

    try {

        // GET VIDEOS
        if (req.method === "GET") {

            const response = await fetch(
                `${baseUrl}/rest/v1/videos?select=*&order=created_at.desc`,
                { headers }
            );

            const result = await readSupabaseResponse(response);

            if (!result.ok) {
                return sendDatabaseError(res, "GET VIDEOS", result);
            }

            return res.status(200).json(result.data);
        }

        // ADD VIDEO
        if (req.method === "POST") {

            const {
                title,
                description,
                youtube_url,
                published
            } = req.body || {};

            if (
                typeof title !== "string" ||
                !title.trim() ||
                title.length > 200
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid video title."
                });
            }

            if (
                typeof youtube_url !== "string" ||
                !validYouTubeUrl(youtube_url)
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid YouTube URL."
                });
            }

            if (
                description !== undefined &&
                typeof description !== "string"
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid description."
                });
            }

            if (
                published !== undefined &&
                typeof published !== "boolean"
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid publish status."
                });
            }

            const video = {
                title: title.trim(),
                description: description ? description.trim() : "",
                youtube_url: youtube_url.trim(),
                thumbnail_url: getYouTubeThumbnail(youtube_url),
                published: published !== false
            };

            console.log("VIDEOHUB DEBUG: Sending video to Supabase.");

            const response = await fetch(
                `${baseUrl}/rest/v1/videos`,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify(video)
                }
            );

            const result = await readSupabaseResponse(response);

            if (!result.ok) {
                return sendDatabaseError(res, "ADD VIDEO", result);
            }

            console.log("VIDEOHUB DEBUG: Video added successfully.");

            return res.status(201).json({
                success: true,
                message: "Video added successfully.",
                data: result.data
            });
        }

        // UPDATE VIDEO
        if (req.method === "PATCH") {

            const {
                id,
                title,
                description,
                youtube_url,
                published
            } = req.body || {};

            if (!validVideoId(id)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid video ID."
                });
            }

            const updates = {};

            if (title !== undefined) {
                if (
                    typeof title !== "string" ||
                    !title.trim() ||
                    title.length > 200
                ) {
                    return res.status(400).json({
                        success: false,
                        error: "Invalid title."
                    });
                }

                updates.title = title.trim();
            }

            if (description !== undefined) {
                if (typeof description !== "string") {
                    return res.status(400).json({
                        success: false,
                        error: "Invalid description."
                    });
                }

                updates.description = description.trim();
            }

            if (youtube_url !== undefined) {
                if (
                    typeof youtube_url !== "string" ||
                    !validYouTubeUrl(youtube_url)
                ) {
                    return res.status(400).json({
                        success: false,
                        error: "Invalid YouTube URL."
                    });
                }

                updates.youtube_url = youtube_url.trim();
                updates.thumbnail_url = getYouTubeThumbnail(youtube_url);
            }

            if (published !== undefined) {
                if (typeof published !== "boolean") {
                    return res.status(400).json({
                        success: false,
                        error: "Invalid publish status."
                    });
                }

                updates.published = published;
            }

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "No changes provided."
                });
            }

            const response = await fetch(
                `${baseUrl}/rest/v1/videos?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(updates)
                }
            );

            const result = await readSupabaseResponse(response);

            if (!result.ok) {
                return sendDatabaseError(res, "UPDATE VIDEO", result);
            }

            return res.status(200).json({
                success: true,
                message: "Video updated successfully.",
                data: result.data
            });
        }

        // DELETE VIDEO
        if (req.method === "DELETE") {

            const id = req.query.id;

            if (!validVideoId(id)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid video ID."
                });
            }

            const response = await fetch(
                `${baseUrl}/rest/v1/videos?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    headers
                }
            );

            const result = await readSupabaseResponse(response);

            if (!result.ok) {
                return sendDatabaseError(res, "DELETE VIDEO", result);
            }

            return res.status(200).json({
                success: true,
                message: "Video deleted successfully."
            });
        }

        res.setHeader("Allow", "GET, POST, PATCH, DELETE");

        return res.status(405).json({
            success: false,
            error: "Method not allowed."
        });

    } catch (error) {

        console.error("VIDEOHUB SERVER DEBUG:", error);

        return res.status(500).json({
            success: false,
            error: "Server error occurred.",
            diagnostic: {
                message: error.message || "Unknown server error.",
                type: error.name || "Error"
            }
        });
    }
};
