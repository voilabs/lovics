import { db } from "@/drizzle";
import {
    vaultContentsTable,
    vaultMembersTable,
    vaultsTable,
} from "@/drizzle/schema";
import { createRoute } from "@/lib/createRoute";
import { t } from "elysia";
import { eq } from "drizzle-orm";
import {
    PutObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { BUCKET_NAME, s3Client } from "@/lib/s3";
import { v4 as uuid } from "uuid";

export default createRoute(
    {
        prefix: "/vaults/:id",
    },
    (app) => {
        app.post(
            "/contents",
            async ({ user, params, body, query, res }) => {
                try {
                    const [vault] = await db
                        .select({
                            id: vaultsTable.id,
                            isEncrypted: vaultsTable.isEncrypted,
                        })
                        .from(vaultsTable)
                        .where(eq(vaultsTable.id, params.id))
                        .limit(1)
                        .catch(() => []);

                    if (!vault) return res.error("VAULT_NOT_FOUND", 404);

                    if (!user) return res.error("UNAUTHORIZED", 401);
                    const [hasMember] = await db
                        .select({
                            id: vaultMembersTable.id,
                        })
                        .from(vaultMembersTable)
                        .where(eq(vaultMembersTable.vaultId, vault.id))
                        .limit(1)
                        .catch(() => []);

                    if (!hasMember) return res.error("UNAUTHORIZED", 401);

                    const action = query.action;

                    if (action === "init") {
                        if (!body.fileName)
                            return res.error("FILE_NAME_REQUIRED", 400);

                        const fileName = `uploads/${uuid()}.${vault.isEncrypted ? "enc" : body.fileName}`;
                        const isEncrypted = body.encrypted === "true";

                        if (vault.isEncrypted && !isEncrypted) {
                            return res.error("ENCRYPTION_REQUIRED", 400);
                        }

                        const command = new CreateMultipartUploadCommand({
                            Bucket: BUCKET_NAME,
                            Key: fileName,
                            ContentType:
                                body.mimeType || "application/octet-stream",
                            Metadata:
                                vault.isEncrypted && body.iv
                                    ? { iv: body.iv }
                                    : undefined,
                            ACL: "private",
                        });

                        const { UploadId } = await s3Client.send(command);

                        return res.success({
                            uploadId: UploadId,
                            key: fileName,
                        });
                    }

                    if (action === "part") {
                        if (
                            !query.uploadId ||
                            !query.key ||
                            !query.partNumber
                        ) {
                            return res.error("MISSING_PART_PARAMS", 400);
                        }

                        const command = new UploadPartCommand({
                            Bucket: BUCKET_NAME,
                            Key: query.key,
                            UploadId: query.uploadId,
                            PartNumber: parseInt(query.partNumber),
                        });

                        const url = await getSignedUrl(s3Client, command, {
                            expiresIn: 900,
                        });

                        return res.success({ url });
                    }

                    if (action === "complete") {
                        if (!query.uploadId || !query.key) {
                            return res.error("MISSING_COMPLETE_PARAMS", 400);
                        }

                        const parts =
                            typeof body.parts === "string"
                                ? JSON.parse(body.parts)
                                : body.parts;

                        if (!parts || !Array.isArray(parts)) {
                            return res.error("INVALID_PARTS", 400);
                        }

                        const command = new CompleteMultipartUploadCommand({
                            Bucket: BUCKET_NAME,
                            Key: query.key,
                            UploadId: query.uploadId,
                            MultipartUpload: {
                                Parts: parts.map((p: any) => ({
                                    ETag: p.ETag,
                                    PartNumber: p.PartNumber,
                                })),
                            },
                        });

                        await s3Client.send(command);

                        return res.success({
                            success: true,
                            file: {
                                name: body.fileName || "unknown",
                                path: query.key,
                                mimeType:
                                    body.originalMimeType ||
                                    "application/octet-stream",
                                size: body.totalSize?.toString() || "0",
                                iv:
                                    vault.isEncrypted && body.iv
                                        ? body.iv
                                        : null,
                                alt:
                                    vault.isEncrypted && body.description
                                        ? body.description
                                        : body.description || null,
                            },
                        });
                    }

                    if (!action || action === "create") {
                        const contents = body.contents;
                        if (!contents || !Array.isArray(contents)) {
                            return res.error("CONTENTS_REQUIRED", 400);
                        }

                        await db.insert(vaultContentsTable).values({
                            vaultId: vault.id,
                            title: body.title || "Untitled",
                            description: body.description || "",
                            contents: contents,
                            createdBy: user.id,
                        });

                        return res.success({ success: true });
                    }

                    return res.error("INVALID_ACTION", 400);
                } catch (error) {
                    console.log("Upload Error:", error);
                    return res.error("INTERNAL_ERROR", 500);
                }
            },
            {
                params: t.Object({
                    id: t.String({ minLength: 1, maxLength: 255 }),
                }),
                query: t.Object({
                    action: t.Optional(t.String()),
                    uploadId: t.Optional(t.String()),
                    key: t.Optional(t.String()),
                    partNumber: t.Optional(t.String()),
                }),
                auth: true,
                body: t.Object({
                    file: t.Optional(t.File()),
                    fileName: t.Optional(t.String()),
                    title: t.Optional(
                        t.String({ minLength: 0, maxLength: 255 }),
                    ),
                    description: t.Optional(
                        t.String({ minLength: 0, maxLength: 255 }),
                    ),
                    originalMimeType: t.Optional(
                        t.String({
                            minLength: 0,
                            maxLength: 255,
                        }),
                    ),
                    iv: t.Optional(t.String({ minLength: 0, maxLength: 255 })),
                    encrypted: t.Optional(t.String()),
                    parts: t.Optional(t.Any()),
                    contents: t.Optional(t.Any()),
                    mimeType: t.Optional(t.String()),
                    totalSize: t.Optional(t.String()),
                }),
            },
        );
    },
);
