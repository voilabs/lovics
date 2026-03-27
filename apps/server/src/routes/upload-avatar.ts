import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import { t } from "elysia";
import { createRoute } from "../lib/createRoute";
import { BUCKET_NAME, s3Client } from "@/lib/s3";
import { toPng } from "@dicebear/converter";
import sharp from "sharp";
import { db } from "@/drizzle";
import { user as userSchema } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

export default createRoute({ prefix: "/upload-avatar" }, (app) =>
    app.post(
        "/",
        async ({ body, user }) => {
            const fileData = await body.file.arrayBuffer();
            const reason = body.reason || "";

            const analyze = await fileTypeFromBuffer(fileData);
            if (!analyze?.ext)
                return {
                    status: false,
                    message: "unknown_file",
                };

            const reasons = {
                user_avatar_url: "*",
            };

            if (reason in reasons) {
                if (reasons[reason as keyof typeof reasons] !== "*") {
                    if (
                        !reasons[reason as keyof typeof reasons].includes(
                            analyze.ext,
                        )
                    )
                        return {
                            status: false,
                            message: "invalid_file_type",
                        };
                }
            } else {
                return {
                    status: false,
                    message: "invalid_reason",
                };
            }

            const png = await sharp(fileData).webp().resize(64, 64).toBuffer();

            const userAvatarPath = user.image.split("/").pop();

            const deleteCommand = new DeleteObjectCommand({
                Bucket: "",
                Key: `avatars/${userAvatarPath}`,
            });

            await s3Client.send(deleteCommand);

            const avatarName = `${user.id}_${Date.now()}.webp`;

            const cmd = new PutObjectCommand({
                Bucket: "",
                Key: `avatars/${avatarName}`,
                Body: Buffer.from(png),
                ContentType: "image/webp",
                ACL: "public-read",
                CacheControl: "no-cache, no-store, must-revalidate",
            });

            const uploadResult = await s3Client.send(cmd);
            if (uploadResult?.$metadata?.httpStatusCode !== 200)
                return {
                    status: false,
                    message: "upload_failed",
                };

            await db
                .update(userSchema)
                .set({
                    image: `https://cdn.lovics.app/avatars/${avatarName}`,
                })
                .where(eq(userSchema.id, user.id));
            return {
                status: true,
                data: `https://cdn.lovics.app/avatars/${avatarName}`,
            };
        },
        {
            body: t.Object({
                file: t.File({
                    maxSize: "10m",
                }),
                reason: t.String({
                    default: "",
                }),
            }),
            detail: {
                summary: "Resim Yükle",
                description: "Sunucuya kullanıcı adına resim yükler.",
            },
            auth: true,
        },
    ),
);
