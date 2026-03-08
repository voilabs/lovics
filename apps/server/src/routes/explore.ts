import { db } from "@/drizzle";
import {
    favoritesTable,
    vaultsTable,
    vaultContentsTable,
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
    inArray,
    lte,
    and,
    exists,
    ilike,
    count,
} from "drizzle-orm";
import { t } from "elysia";

export default createRoute(
    {
        prefix: "/explore",
    },
    (app) => {
        app.get(
            "/",
            async ({ user, query, res }) => {
                let { search = "", page = 1 } = query;

                const [totalResults] = await db
                    .select({
                        count: count(vaultsTable.id),
                    })
                    .from(vaultsTable)
                    .where(
                        and(
                            eq(vaultsTable.isEncrypted, false),
                            ilike(vaultsTable.title, `%${search}%`),
                            exists(
                                db
                                    .select({ id: vaultContentsTable.id })
                                    .from(vaultContentsTable)
                                    .where(
                                        eq(
                                            vaultContentsTable.vaultId,
                                            vaultsTable.id,
                                        ),
                                    ),
                            ),
                        ),
                    )
                    .catch(() => [{ count: 0 }]);

                const maxPages = Math.ceil((totalResults as any).count / 10);

                if (page > maxPages) page = maxPages;
                if (page < 1) page = 1;

                const vaults = await db
                    .select({
                        ...getTableColumns(vaultsTable),
                        favoritesCount:
                            sql<number>`count(${favoritesTable.id})`.mapWith(
                                Number,
                            ),
                    })
                    .from(vaultsTable)
                    .leftJoin(
                        favoritesTable,
                        eq(vaultsTable.id, favoritesTable.vaultId),
                    )
                    .where(
                        and(
                            eq(vaultsTable.isEncrypted, false),
                            ilike(vaultsTable.title, `%${search}%`),
                            exists(
                                db
                                    .select({ id: vaultContentsTable.id })
                                    .from(vaultContentsTable)
                                    .where(
                                        eq(
                                            vaultContentsTable.vaultId,
                                            vaultsTable.id,
                                        ),
                                    ),
                            ),
                        ),
                    )
                    .groupBy(vaultsTable.id)
                    .orderBy(desc(sql`count(${favoritesTable.id})`))
                    .limit(10)
                    .offset((page - 1) * 10);

                if (vaults.length === 0) {
                    return res.success({ vaults: [], maxPages, page });
                }

                const vaultIds = vaults.map((v) => v.id);

                const sq = db
                    .select({
                        ...getTableColumns(vaultContentsTable),
                        rowNum: sql<number>`row_number() over (partition by ${vaultContentsTable.vaultId} order by ${vaultContentsTable.createdAt} desc)`.as(
                            "rowNum",
                        ),
                    })
                    .from(vaultContentsTable)
                    .where(inArray(vaultContentsTable.vaultId, vaultIds))
                    .as("sq");

                const latestContents = await db
                    .select()
                    .from(sq)
                    .where(lte(sq.rowNum, 5));

                const vaultsWithContents = vaults
                    .map((vault) => ({
                        ...vault,
                        vaultContentRows: latestContents
                            .filter((content) => content.vaultId === vault.id)
                            .map(({ rowNum, ...rest }) => rest),
                    }))
                    .filter((vault) => vault.vaultContentRows.length > 0);

                const vaultsWithSignedUrls = await Promise.all(
                    vaultsWithContents.map(async (vault) => {
                        const rowsWithUrls = await Promise.all(
                            vault.vaultContentRows.map(async (row) => {
                                const filesWithUrls = await Promise.all(
                                    (row.contents || []).map(async (file) => {
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
                                    ...row,
                                    contents: filesWithUrls,
                                };
                            }),
                        );
                        return {
                            ...vault,
                            contents: rowsWithUrls,
                            vaultContentRows: undefined,
                        };
                    }),
                );

                return res.success({
                    vaults: vaultsWithSignedUrls,
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
