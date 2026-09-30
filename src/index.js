export default {
    async fetch(request, env) {

        const url = new URL(request.url);

        // API for listing files in R2
        if (url.pathname === "/api/files") {

            let cursor;
            const objects = [];

            do {

                const listed = await env.MY_BUCKET.list({
                    limit: 1000,
                    cursor: cursor
                });

                objects.push(...listed.objects);

                cursor = listed.truncated
                    ? listed.cursor
                    : undefined;

            } while (cursor);

            const files = objects.map(object => {

                return {
                    name: object.key,
                    size: formatBytes(object.size),
                    url: "https://pub-5dd4827a6086430ba3e6db4da1b69ce8.r2.dev/" +
                        object.key
                            .split("/")
                            .map(encodeURIComponent)
                            .join("/")
                };

            });

            return new Response(JSON.stringify(files), {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // Everything else goes to the normal website
        return env.ASSETS.fetch(request);
    }
};


function formatBytes(bytes) {

    if (bytes === 0) {
        return "0 Bytes";
    }

    const sizes = ["Bytes", "KB", "MB", "GB"];

    const i = Math.floor(
        Math.log(bytes) / Math.log(1024)
    );

    return Math.round(
        bytes / Math.pow(1024, i) * 100
    ) / 100 + " " + sizes[i];
}
