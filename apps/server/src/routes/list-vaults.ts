import { db } from "@/drizzle";
import {
    vaultContentsTable,
    vaultMembersTable,
    vaultsTable,
} from "@/drizzle/schema";
import { createRoute } from "@/lib/createRoute";
import { and, count, eq, ilike } from "drizzle-orm";
import { t } from "elysia";

export default createRoute(
    {
        prefix: "/vaults",
    },
    (app) => {
        app.get(
            "/",
            async ({ user, res }) => {
                const result = await db
                    .select({
                        id: vaultsTable.id,
                        title: vaultsTable.title,
                        icon: vaultsTable.icon,
                        color: vaultsTable.color,
                        isPremium: vaultsTable.isPremium,
                        isEncrypted: vaultsTable.isEncrypted,
                        createdAt: vaultsTable.createdAt,
                    })
                    .from(vaultsTable)
                    .innerJoin(
                        vaultMembersTable,
                        eq(vaultsTable.id, vaultMembersTable.vaultId),
                    )
                    .where(eq(vaultMembersTable.userId, user.id));

                const data = await Promise.all(
                    result.map(async (vault) => {
                        const medias = await db
                            .select({
                                contents: vaultContentsTable.contents,
                            })
                            .from(vaultContentsTable)
                            .where(eq(vaultContentsTable.vaultId, vault.id))
                            .catch(() => []);

                        return {
                            ...vault,
                            mediaCount: medias.reduce((acc, media) => {
                                return (
                                    acc + (media.contents?.length as any) || 0
                                );
                            }, 0),
                        };
                    }),
                );

                return res.success(
                    data.map((vault) => ({
                        ...vault,
                        year: new Date(vault.createdAt)
                            .getFullYear()
                            .toString(),
                        iconColor: vault.color,
                    })),
                );
            },
            {
                auth: true,
            },
        );
    },
);
