import {
    boolean,
    json,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";
import { user } from "@/drizzle/schema";

export const vaultContentsTable = pgTable("vault_contents", {
    id: uuid().defaultRandom().primaryKey(),
    vaultId: uuid().references(() => vaultsTable.id),
    title: varchar({ length: 255 }).notNull(),
    description: varchar({ length: 255 }).notNull(),
    contents: json("contents")
        .$type<
            {
                name: string;
                path: string;
                mimeType: string;
                size: string;
                iv: string | null;
                alt?: string;
                dimensions?: {
                    width: number;
                    height: number;
                };
            }[]
        >()
        .default([]),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => new Date()),
    createdBy: varchar().references(() => user.id),
});

export const vaultsTable = pgTable("vaults", {
    id: uuid().defaultRandom().primaryKey(),
    title: varchar({ length: 255 }).notNull(),
    icon: varchar({ length: 255 }).notNull(),
    color: varchar({ length: 255 }).notNull(),
    theme: varchar({ length: 255 }).notNull(),
    isEncrypted: boolean().notNull(),
    isPremium: boolean().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => new Date()),
});

export const vaultMembersTable = pgTable("vault_members", {
    id: uuid().defaultRandom().primaryKey(),
    vaultId: uuid().references(() => vaultsTable.id),
    userId: varchar().references(() => user.id),
    primaryOwner: boolean().default(false),
    encryptedVaultKey: text("encrypted_vault_key"),
    salt: text("salt"),
});
