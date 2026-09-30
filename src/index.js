export default {

    async fetch(request, env) {

        const url = new URL(request.url);


        /*
            ========================================
            GET ALL FILES
            ========================================
        */

        if (
            url.pathname === "/api/files" &&
            request.method === "GET"
        ) {

            let cursor;

            const objects = [];


            /*
                Get files from R2
            */

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
                Make metadata easier
                to look up
            */

            const metadataByKey =
                new Map();


            metadata.forEach(item => {

                metadataByKey.set(
                    item.r2_key,
                    item
                );

            });



            /*
                Combine R2 + D1
            */

            const files =
                objects.map(object => {


                    const info =
                        metadataByKey.get(
                            object.key
                        );


                    return {

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



            return jsonResponse(
                files
            );

        }



        /*
            ========================================
            SAVE METADATA
            ========================================
        */

        if (
            url.pathname === "/api/admin/save" &&
            request.method === "POST"
        ) {

            try {


                /*
                    Read information sent
                    from admin.html
                */

                const data =
                    await request.json();



                /*
                    A file must be selected
                */

                if (!data.r2_key) {

                    return jsonResponse(
                        {
                            success: false,
                            message:
                                "No file selected."
                        },
                        400
                    );

                }



                /*
                    Make sure this file
                    really exists in R2
                */

                const object =
                    await env.MY_BUCKET.head(
                        data.r2_key
                    );


                if (!object) {

                    return jsonResponse(
                        {
                            success: false,
                            message:
                                "File does not exist in R2."
                        },
                        404
                    );

                }



                /*
                    Handle year
                */

                let year = null;


                if (
                    data.year !== "" &&
                    data.year !== null &&
                    data.year !== undefined
                ) {

                    year =
                        parseInt(
                            data.year,
                            10
                        );


                    if (isNaN(year)) {

                        year = null;

                    }

                }



                /*
                    Save metadata to D1

                    If metadata already exists
                    for this R2 file, update it.
                */

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

                        VALUES
                        (
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?
                        )

                        ON CONFLICT(r2_key)

                        DO UPDATE SET

                            title =
                                excluded.title,

                            creator =
                                excluded.creator,

                            description =
                                excluded.description,

                            tags =
                                excluded.tags,

                            year =
                                excluded.year,

                            category =
                                excluded.category

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



                /*
                    Tell admin.html
                    that it worked
                */

                return jsonResponse(
                    {
                        success: true,
                        message:
                            "Metadata saved."
                    }
                );


            }

            catch (error) {


                console.log(
                    error
                );


                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Error saving metadata: " +
                            error.message
                    },
                    500
                );

            }

        }



        /*
            ========================================
            NORMAL WEBSITE
            ========================================
        */

        return env.ASSETS.fetch(
            request
        );

    }

};



/*
    JSON RESPONSE
*/


function jsonResponse(
    data,
    status = 200
) {

    return new Response(
        JSON.stringify(data),
        {
            status: status,

            headers: {

                "Content-Type":
                    "application/json"

            }
        }
    );

}



/*
    FORMAT FILE SIZE
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