import { db } from "@/drizzle";
import { vaultsTable, vaultMembersTable } from "@/drizzle/schema";
import { createRoute } from "@/lib/createRoute";
import { eq, and } from "drizzle-orm";
import { t } from "elysia";

export default createRoute(
    {
        prefix: "/vaults",
    },
    (app) => {
        app.put(
            "/:id/change-password",
            async ({ user, body, params, res }) => {
                const { id } = params;

                const [membership] = await db
                    .select()
                    .from(vaultMembersTable)
                    .where(
                        and(
                            eq(vaultMembersTable.userId, user.id),
                            eq(vaultMembersTable.vaultId, id),
                        ),
                    )
                    .limit(1);

                if (!membership) {
                    return res.error("UNAUTHORIZED", 401);
                }

                await db
                    .update(vaultMembersTable)
                    .set({
                        encryptedVaultKey: body.encryptedVaultKey,
                        salt: body.salt,
                    })
                    .where(
                        and(
                            eq(vaultMembersTable.vaultId, id),
                            eq(vaultMembersTable.userId, user.id),
                        ),
                    );

                return res.success({});
            },
            {
                params: t.Object({
                    id: t.String(),
                }),
                body: t.Object({
                    encryptedVaultKey: t.String(),
                    salt: t.String(),
                }),
                auth: true,
            },
        );
    },
);
