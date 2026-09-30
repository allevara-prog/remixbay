export default {

    async fetch(request, env) {

        const url = new URL(request.url);


        /*
            API - Get all files
        */

        if (url.pathname === "/api/files") {

            /*
                Get files from R2
            */

            let cursor;

            const objects = [];


            do {

                const listed =
                    await env.MY_BUCKET.list({
                        limit: 1000,
                        cursor: cursor
                    });


                objects.push(
                    ...listed.objects
                );


                cursor =
                    listed.truncated
                        ? listed.cursor
                        : undefined;


            } while (cursor);



            /*
                Get metadata from D1
            */

            const databaseResults =
                await env.remixbay_db
                    .prepare(
                        "SELECT * FROM files"
                    )
                    .all();


            const metadata =
                databaseResults.results;



            /*
                Match D1 information
                with R2 files
            */

            const files =
                objects.map(object => {


                    const info =
                        metadata.find(
                            item =>
                                item.r2_key ===
                                object.key
                        );


                    return {

                        /*
                            R2 information
                        */

                        name:
                            object.key,

                        size:
                            formatBytes(
                                object.size
                            ),

                        url:
                            "https://pub-5dd4827a6086430ba3e6db4da1b69ce8.r2.dev/" +
                            object.key
                                .split("/")
                                .map(encodeURIComponent)
                                .join("/"),


                        /*
                            D1 information
                        */

                        title:
                            info?.title || "",

                        creator:
                            info?.creator || "",

                        description:
                            info?.description || "",

                        tags:
                            info?.tags || "",

                        year:
                            info?.year || "",

                        category:
                            info?.category || ""

                    };

                });



            /*
                Send everything to website
            */

            return new Response(
                JSON.stringify(files),
                {
                    headers: {

                        "Content-Type":
                            "application/json",

                        "Access-Control-Allow-Origin":
                            "*"

                    }
                }
            );

        }



        /*
            Everything else is the
            normal website
        */

        return env.ASSETS.fetch(
            request
        );

    }

};



/*
    Convert bytes into
    KB / MB / GB
*/


function formatBytes(bytes) {


    if (bytes === 0) {

        return "0 Bytes";

    }


    const sizes = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];


    const i =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return (
        Math.round(
            bytes /
            Math.pow(1024, i) *
            100
        ) / 100
    ) +
    " " +
    sizes[i];

}