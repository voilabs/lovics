import { db } from "@/drizzle";
import {
    favoritesTable,
    vaultsTable,
    vaultContentsTable,
} from "@/drizzle/schema";
import { createRoute } from "@/lib/createRoute";
import {
    desc,
    eq,
    sql,
    getTableColumns,
    inArray,
    lte,
    and,
    exists,
} from "drizzle-orm";

export default createRoute(
    {
        prefix: "/explore",
    },
    (app) => {
        app.get(
            "/",
            async ({ user, res }) => {
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
                    .limit(10);

                if (vaults.length === 0) {
                    return res.success({ vaults: [] });
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
                        contents: latestContents
                            .filter((content) => content.vaultId === vault.id)
                            .map(({ rowNum, ...rest }) => rest),
                    }))
                    .filter((vault) => vault.contents.length > 0);

                return res.success({ vaults: vaultsWithContents });
            },
            {
                auth: true,
            },
        );
    },
);
