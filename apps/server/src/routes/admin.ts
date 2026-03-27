import { db } from "@/drizzle";
import { vaultsTable, vaultContentsTable, user } from "@/drizzle/schema";
import { createRoute } from "@/lib/createRoute";
import { BUCKET_NAME, s3Client } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, count, desc, eq, getTableColumns } from "drizzle-orm";
import { t } from "elysia";

const PER_PAGE = 10;

export default createRoute(
    {
        prefix: "/admin",
    },
    (app) => {
        app.get(
            "/:tableName",
            async ({ query, params, res }) => {
                const CURRENT_PAGE = query.page || 1;
                const { tableName } = params;

                if (tableName === "vaults") {
                    const vaults = await db
                        .select()
                        .from(vaultsTable)
                        .where(eq(vaultsTable.isEncrypted, false))
                        .limit(PER_PAGE)
                        .offset((CURRENT_PAGE - 1) * PER_PAGE);

                    const totalVaults = await db
                        .select({
                            count: count(vaultsTable.id),
                        })
                        .from(vaultsTable)
                        .where(eq(vaultsTable.isEncrypted, false))
                        .catch(() => [{ count: 0 }]);

                    return res.success({
                        results: vaults,
                        page: CURRENT_PAGE,
                        maxPage: Math.ceil(
                            (totalVaults as any)?.[0].count / PER_PAGE,
                        ),
                    });
                } else if (tableName === "contents") {
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
                        .innerJoin(
                            user,
                            eq(vaultContentsTable.createdBy, user.id),
                        )
                        .where(and(eq(vaultsTable.isEncrypted, false)))
                        .orderBy(desc(vaultContentsTable.createdAt))
                        .limit(PER_PAGE)
                        .offset((CURRENT_PAGE - 1) * PER_PAGE);

                    const totalContents = await db
                        .select({
                            count: count(vaultContentsTable.id),
                        })
                        .from(vaultContentsTable)
                        .innerJoin(
                            vaultsTable,
                            eq(vaultContentsTable.vaultId, vaultsTable.id),
                        )
                        .where(and(eq(vaultsTable.isEncrypted, false)))
                        .catch(() => [{ count: 0 }]);

                    const feedWithSignedUrls = await Promise.all(
                        feedItems.map(async (item) => {
                            const filesWithUrls = await Promise.all(
                                (item.content.contents || []).map(
                                    async (file) => {
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
                                    },
                                ),
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
                        results: feedWithSignedUrls,
                        page: CURRENT_PAGE,
                        maxPage: Math.ceil(
                            (totalContents as any)?.[0].count / PER_PAGE,
                        ),
                    });
                } else {
                    return res.error("Invalid table name.");
                }
            },
            {
                auth: true,
                permissions: {
                    vaults: ["list"],
                },
                query: t.Object({
                    page: t.Number({ default: 1 }),
                }),
            },
        );

        app.delete(
            "/:tableName/:id",
            async ({ params, res }) => {
                const { tableName, id } = params;

                if (tableName === "vaults") {
                    await db.delete(vaultsTable).where(eq(vaultsTable.id, id));

                    return res.success("Vault deleted successfully.");
                } else if (tableName === "contents") {
                    await db
                        .delete(vaultContentsTable)
                        .where(eq(vaultContentsTable.id, id));

                    return res.success("Content deleted successfully.");
                } else {
                    return res.error("Invalid table name.");
                }
            },
            {
                auth: true,
                permissions: {
                    vaults: ["delete"],
                },
                params: t.Object({
                    tableName: t.String(),
                    id: t.String(),
                }),
            },
        );
    },
);
