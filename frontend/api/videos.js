
const {
    verifySession,
    getSessionToken
} = require("../lib/auth");

function getSupabaseHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    return {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    };
}

function validYouTubeUrl(value) {
    try {
        const url = new URL(value);

        if (!["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(url.hostname)) {
            return false;
        }

        return url.hostname === "youtu.be"
            ? url.pathname.length > 1
            : url.pathname === "/watch" && url.searchParams.has("v") ||
              url.pathname.startsWith("/embed/") ||
              url.pathname.startsWith("/shorts/");
    } catch {
        return false;
    }
}

function getYouTubeThumbnail(url) {
    try {
        const parsed = new URL(url);
        let id = "";

        if (parsed.hostname === "youtu.be") {
            id = parsed.pathname.slice(1);
        } else if (parsed.pathname === "/watch") {
            id = parsed.searchParams.get("v") || "";
        } else {
            id = parsed.pathname.split("/").pop() || "";
        }

        return id
            ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
            : null;
    } catch {
        return null;
    }
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
        if (req.method === "GET") {
            const response = await fetch(
                `${supabaseUrl}/rest/v1/videos?select=*&order=created_at.desc`,
                { headers: getSupabaseHeaders() }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error("Unable to load videos.");
            }

            return res.status(200).json(data);
        }

        if (req.method === "POST") {
            const { title, description, youtube_url, published } = req.body || {};

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

            const video = {
                title: title.trim(),
                description: typeof description === "string"
                    ? description.trim()
                    : "",
                youtube_url: youtube_url.trim(),
                thumbnail_url: getYouTubeThumbnail(youtube_url),
                published: published !== false
            };

            const response = await fetch(
                `${supabaseUrl}/rest/v1/videos`,
                {
                    method: "POST",
                    headers: getSupabaseHeaders(),
                    body: JSON.stringify(video)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error("Unable to add video.");
            }

            return res.status(201).json(data);
        }

        if (req.method === "PATCH") {
            const { id, title, description, youtube_url, published } = req.body || {};

            if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
                return res.status(400).json({
                    error: "Invalid video ID."
                });
            }

            const updates = {};

            if (title !== undefined) {
                if (typeof title !== "string" || !title.trim() || title.length > 200) {
                    return res.status(400).json({ error: "Invalid title." });
                }
                updates.title = title.trim();
            }

            if (description !== undefined) {
                if (typeof description !== "string") {
                    return res.status(400).json({ error: "Invalid description." });
                }
                updates.description = description.trim();
            }

            if (youtube_url !== undefined) {
                if (typeof youtube_url !== "string" || !validYouTubeUrl(youtube_url)) {
                    return res.status(400).json({ error: "Invalid YouTube URL." });
                }
                updates.youtube_url = youtube_url.trim();
                updates.thumbnail_url = getYouTubeThumbnail(youtube_url);
            }

            if (published !== undefined) {
                if (typeof published !== "boolean") {
                    return res.status(400).json({ error: "Invalid publish status." });
                }
                updates.published = published;
            }

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ error: "No changes provided." });
            }

            const response = await fetch(
                `${supabaseUrl}/rest/v1/videos?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "PATCH",
                    headers: getSupabaseHeaders(),
                    body: JSON.stringify(updates)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error("Unable to update video.");
            }

            return res.status(200).json(data);
        }

        if (req.method === "DELETE") {
            const id = req.query.id;

            if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
                return res.status(400).json({
                    error: "Invalid video ID."
                });
            }

            const response = await fetch(
                `${supabaseUrl}/rest/v1/videos?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    headers: getSupabaseHeaders()
                }
            );

            if (!response.ok) {
                throw new Error("Unable to delete video.");
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
        console.error("Video API error:", error.message);

        return res.status(500).json({
            error: "A server error occurred while managing videos."
        });
    }
};
