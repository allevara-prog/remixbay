import { AwsClient } from "aws4fetch";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Return all R2 files with their D1 metadata
        if (url.pathname === "/api/files" && request.method === "GET") {
            let cursor;
            const objects = [];

            do {
                const listed = await env.MY_BUCKET.list({
                    limit: 1000,
                    cursor
                });

                objects.push(...listed.objects);
                cursor = listed.truncated ? listed.cursor : undefined;
            } while (cursor);

            const databaseResults = await env.remixbay_db
                .prepare("SELECT * FROM files")
                .all();

            const metadataByKey = new Map();

            databaseResults.results.forEach(item => {
                metadataByKey.set(item.r2_key, item);
            });

            const files = objects.map(object => {
                const info = metadataByKey.get(object.key);

                return {
                    name: object.key,
                    size: formatBytes(object.size),

                    url:
                        "https://pub-5dd4827a6086430ba3e6db4da1b69ce8.r2.dev/" +
                        object.key
                            .split("/")
                            .map(encodeURIComponent)
                            .join("/"),

                    title: info?.title || "",
                    creator: info?.creator || "",
                    description: info?.description || "",
                    tags: info?.tags || "",
                    year: info?.year || "",
                    category: info?.category || ""
                };
            });

            return jsonResponse(files);
        }

        // Save metadata from the admin page
        if (
            url.pathname === "/api/admin/save" &&
            request.method === "POST"
        ) {
            try {
                const data = await request.json();

                if (!data.r2_key) {
                    return jsonResponse({
                        success: false,
                        message: "No file selected."
                    }, 400);
                }

                const object = await env.MY_BUCKET.head(data.r2_key);

                if (!object) {
                    return jsonResponse({
                        success: false,
                        message: "File does not exist in R2."
                    }, 404);
                }

                let year = null;

                if (
                    data.year !== "" &&
                    data.year !== null &&
                    data.year !== undefined
                ) {
                    year = parseInt(data.year, 10);

                    if (isNaN(year)) {
                        year = null;
                    }
                }

                await env.remixbay_db
                    .prepare(`
                        INSERT INTO files
                        (
                            r2_key,
                            title,
                            creator,
                            description,
                            tags,
                            year,
                            category
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)

                        ON CONFLICT(r2_key)
                        DO UPDATE SET
                            title = excluded.title,
                            creator = excluded.creator,
                            description = excluded.description,
                            tags = excluded.tags,
                            year = excluded.year,
                            category = excluded.category
                    `)
                    .bind(
                        data.r2_key,
                        data.title || "",
                        data.creator || "",
                        data.description || "",
                        data.tags || "",
                        year,
                        data.category || ""
                    )
                    .run();

                return jsonResponse({
                    success: true,
                    message: "Metadata saved."
                });
            } catch (error) {
                console.log(error);

                return jsonResponse({
                    success: false,
                    message: "Error saving metadata: " + error.message
                }, 500);
            }
        }

        // Create a temporary URL so admin.html can upload directly to R2
        if (
            url.pathname === "/api/admin/upload-url" &&
            request.method === "POST"
        ) {
            try {
                const data = await request.json();

                if (!data.filename) {
                    return jsonResponse({
                        success: false,
                        message: "No filename supplied."
                    }, 400);
                }

                let folder = data.folder || "";

                folder = folder
                    .trim()
                    .replace(/^\/+/, "")
                    .replace(/\/+$/, "");

                if (
                    folder.includes("..") ||
                    folder.includes("\\")
                ) {
                    return jsonResponse({
                        success: false,
                        message: "Invalid folder path."
                    }, 400);
                }

                const filename = String(data.filename)
                    .replace(/\//g, "_")
                    .replace(/\\/g, "_");

                let r2Key = filename;

                if (folder !== "") {
                    r2Key = folder + "/" + filename;
                }

                // Don't overwrite an existing R2 object
                const existing = await env.MY_BUCKET.head(r2Key);

                if (existing) {
                    return jsonResponse({
                        success: false,
                        message: "A file already exists at this path."
                    }, 409);
                }

                const contentType =
                    data.contentType || "application/octet-stream";

                const client = new AwsClient({
                    service: "s3",
                    region: "auto",
                    accessKeyId: env.R2_ACCESS_KEY_ID,
                    secretAccessKey: env.R2_SECRET_ACCESS_KEY
                });

                const r2Url =
                    "https://" +
                    env.R2_ACCOUNT_ID +
                    ".r2.cloudflarestorage.com/" +
                    "remixbay/" +
                    r2Key
                        .split("/")
                        .map(encodeURIComponent)
                        .join("/") +
                    "?X-Amz-Expires=3600";

                const signedRequest = await client.sign(
                    new Request(r2Url, {
                        method: "PUT",
                        headers: {
                            "Content-Type": contentType
                        }
                    }),
                    {
                        aws: {
                            signQuery: true
                        }
                    }
                );

                return jsonResponse({
                    success: true,
                    uploadUrl: signedRequest.url.toString(),
                    key: r2Key,
                    contentType
                });
            } catch (error) {
                console.log(error);

                return jsonResponse({
                    success: false,
                    message:
                        "Could not create upload URL: " +
                        error.message
                }, 500);
            }
        }

        // Everything else is served from the site's static assets
        return env.ASSETS.fetch(request);
    }
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

function formatBytes(bytes) {
    if (bytes === 0) {
        return "0 Bytes";
    }

    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const amount =
        Math.round((bytes / Math.pow(1024, i)) * 100) / 100;

    return amount + " " + sizes[i];
}