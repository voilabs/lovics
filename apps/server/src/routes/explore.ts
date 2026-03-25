import { db } from "@/drizzle";
import {
    favoritesTable,
    vaultsTable,
    vaultContentsTable,
    user,
} from "@/drizzle/schema";
import { createRoute } from "@/lib/createRoute";
import { BUCKET_NAME, s3Client } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
    desc,
    eq,
    sql,
    getTableColumns,
    and,
    ilike,
    count,
    or,
} from "drizzle-orm";
import { t } from "elysia";

export default createRoute(
    {
        prefix: "/explore",
    },
    (app) => {
        app.get(
            "/",
            async ({ query, res }) => {
                let { search = "", page = 1 } = query;
                const limit = 10;

                const searchFilter = search
                    ? or(
                          ilike(vaultContentsTable.title, `%${search}%`),
                          ilike(vaultContentsTable.description, `%${search}%`),
                          ilike(vaultsTable.title, `%${search}%`),
                      )
                    : undefined;

                const [totalResults] = await db
                    .select({
                        count: count(vaultContentsTable.id),
                    })
                    .from(vaultContentsTable)
                    .innerJoin(
                        vaultsTable,
                        eq(vaultContentsTable.vaultId, vaultsTable.id),
                    )
                    .innerJoin(user, eq(vaultContentsTable.createdBy, user.id))
                    .where(
                        and(eq(vaultsTable.isEncrypted, false), searchFilter),
                    )
                    .catch(() => [{ count: 0 }]);

                const maxPages = Math.ceil((totalResults as any).count / limit);

                if (page > maxPages) page = maxPages;
                if (page < 1) page = 1;

                const feedItems = await db
                    .select({
                        content: getTableColumns(vaultContentsTable),
                        vault: getTableColumns(vaultsTable),
                        user: {
                            id: user.id,
                            username: user.username,
                            displayUsername: user.displayUsername,
                            image: user.image,
                        },
                    })
                    .from(vaultContentsTable)
                    .innerJoin(
                        vaultsTable,
                        eq(vaultContentsTable.vaultId, vaultsTable.id),
                    )
                    .innerJoin(user, eq(vaultContentsTable.createdBy, user.id))
                    .where(
                        and(eq(vaultsTable.isEncrypted, false), searchFilter),
                    )
                    .orderBy(desc(vaultContentsTable.createdAt))
                    .limit(limit)
                    .offset((page - 1) * limit);

                if (feedItems.length === 0) {
                    return res.success({ feed: [], maxPages, page });
                }

                const feedWithSignedUrls = await Promise.all(
                    feedItems.map(async (item) => {
                        const filesWithUrls = await Promise.all(
                            (item.content.contents || []).map(async (file) => {
                                const command = new GetObjectCommand({
                                    Bucket: BUCKET_NAME,
                                    Key: file.path,
                                });

                                const url = await getSignedUrl(
                                    s3Client,
                                    command,
                                    {
                                        expiresIn: 900,
                                    },
                                );

                                return {
                                    ...file,
                                    url,
                                };
                            }),
                        );

                        return {
                            ...item.content,
                            contents: filesWithUrls,
                            vault: item.vault,
                            user: item.user,
                        };
                    }),
                );

                return res.success({
                    feed: feedWithSignedUrls,
                    maxPages,
                    page,
                });
            },
            {
                query: t.Object({
                    search: t.Optional(
                        t.String({ minLength: 0, maxLength: 255 }),
                    ),
                    page: t.Optional(t.Number({ default: 1 })),
                }),
                auth: true,
            },
        );
    },
);
