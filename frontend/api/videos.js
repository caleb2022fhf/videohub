
const { verifySession, getSessionToken } = require("../lib/auth");

function getSupabaseHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    return {
        "apikey": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    };
}

function validYouTubeUrl(value) {
    try {
        const url = new URL(value);

        const allowedHosts = [
            "youtube.com",
            "www.youtube.com",
            "youtu.be",
            "m.youtube.com"
        ];

        if (!allowedHosts.includes(url.hostname)) {
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

function validVideoId(id) {
    return typeof id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

module.exports = async function handler(req, res) {

    const token = getSessionToken(req);
    const session = verifySession(token);

    if (
        !session ||
        session.email.trim().toLowerCase() !==
        (process.env.ADMIN_EMAIL || "").trim().toLowerCase()
    ) {
        return res.status(401).json({
            error: "Unauthorized. Please login again."
        });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({
            error: "Database server configuration is missing."
        });
    }

    try {
        const baseUrl = supabaseUrl.replace(/\/+$/, "");
        const headers = getSupabaseHeaders();

        // GET VIDEOS
        if (req.method === "GET") {

            const response = await fetch(
                `${baseUrl}/rest/v1/videos?select=*&order=created_at.desc`,
                { headers }
            );

            const data = await response.json();

            if (!response.ok) {
                console.error("Supabase GET error:", data);

                return res.status(500).json({
                    error: "Unable to load videos."
                });
            }

            return res.status(200).json(data);
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
                title.length > 200 ||
                typeof youtube_url !== "string" ||
                !validYouTubeUrl(youtube_url)
            ) {
                return res.status(400).json({
                    error: "Enter a valid title and YouTube URL."
                });
            }

            if (
                description !== undefined &&
                typeof description !== "string"
            ) {
                return res.status(400).json({
                    error: "Invalid description."
                });
            }

            if (
                published !== undefined &&
                typeof published !== "boolean"
            ) {
                return res.status(400).json({
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

            const response = await fetch(
                `${baseUrl}/rest/v1/videos`,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify(video)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                console.error("Supabase INSERT error:", data);

                return res.status(500).json({
                    error: "Unable to add video. Check the database configuration."
                });
            }

            return res.status(201).json(data);
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
                        error: "Invalid title."
                    });
                }

                updates.title = title.trim();
            }

            if (description !== undefined) {
                if (typeof description !== "string") {
                    return res.status(400).json({
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
                        error: "Invalid YouTube URL."
                    });
                }

                updates.youtube_url = youtube_url.trim();
                updates.thumbnail_url = getYouTubeThumbnail(youtube_url);
            }

            if (published !== undefined) {
                if (typeof published !== "boolean") {
                    return res.status(400).json({
                        error: "Invalid publish status."
                    });
                }

                updates.published = published;
            }

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
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

            const data = await response.json();

            if (!response.ok) {
                console.error("Supabase UPDATE error:", data);

                return res.status(500).json({
                    error: "Unable to update video."
                });
            }

            return res.status(200).json(data);
        }

        // DELETE VIDEO
        if (req.method === "DELETE") {

            const id = req.query.id;

            if (!validVideoId(id)) {
                return res.status(400).json({
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

            if (!response.ok) {
                const data = await response.text();

                console.error("Supabase DELETE error:", data);

                return res.status(500).json({
                    error: "Unable to delete video."
                });
            }

            return res.status(200).json({
                success: true,
                message: "Video deleted successfully."
            });
        }

        res.setHeader("Allow", "GET, POST, PATCH, DELETE");

        return res.status(405).json({
            error: "Method not allowed."
        });

    } catch (error) {

        console.error("Video API error:", error);

        return res.status(500).json({
            error: "A server error occurred while managing videos."
        });
    }
};
