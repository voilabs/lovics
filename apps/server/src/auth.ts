import { betterAuth, uuidv4 } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/drizzle";
import * as schema from "@/drizzle/schemas/auth-schema";
import { expo } from "@better-auth/expo";
import Elysia from "elysia";
import { createAuthMiddleware, emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import Handlebars from "handlebars";
import fs from "fs/promises";
import { s3Client } from "./lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { toPng } from "@dicebear/converter";
import { createAvatar } from "@dicebear/core";
import { glass } from "@dicebear/collection";
import { v4 as uuid } from "uuid";
const resend = new Resend(process.env.RESEND_API_KEY!);

export const auth = betterAuth({
    baseURL: process.env.BASE_URL,
    basePath: "/auth",
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),
    emailAndPassword: {
        enabled: true,
    },
    plugins: [
        expo(),
        emailOTP({
            sendVerificationOTP: async ({ email, otp, type }) => {
                const [userObj] = await db
                    .select()
                    .from(schema.user)
                    .where(eq(schema.user.email, email))
                    .catch(() => [null]);

                let action = "Sign In";
                if (type === "sign-in") return;
                if (type === "email-verification")
                    action = "Email Verification";
                if (type === "forget-password") action = "Forget Password";

                const otpFile = await fs.readFile(
                    __dirname + "/emails/otp.html",
                    { encoding: "utf-8" },
                );

                const emailVariants = {
                    "email-verification": {
                        action: "Welcome",
                        title: `Welcome to Lovics, ${userObj?.name.replace(":", " ") || "N/A"}! 👋`,
                        body_1: "Thank you for joining us!",
                        body_2: "We’re glad you’re here. Ready to see what we’ve built for you?",
                        body_3: "",
                    },
                    "forget-password": {
                        action: "Reset Password",
                        title: `Reset Your Password 🔒`,
                        body_1: "We received a request to reset the password for your Lovics account. Use the code below to proceed:",
                        body_2: "This code is valid for 10 minutes. For security, do not share this code with anyone.",
                        code: otp,
                        body_3: "If you did not request a password reset, you can safely ignore this email. Your account remains secure.",
                    },
                    "sign-in": {},
                };

                const template = Handlebars.compile(otpFile);

                resend.emails.send({
                    from: "Lovics <noreply@lovics.app>",
                    to: email,
                    subject: `${emailVariants[type].action} — Lovics`,
                    html: template(
                        Object.assign(emailVariants[type], {
                            year: new Date().getFullYear(),
                        }),
                    ),
                });
            },
            sendVerificationOnSignUp: true,
            otpLength: 6,
        }),
    ],
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path === "/sign-up/email") {
                const avatar = createAvatar(glass, {
                    seed: ctx.body.name.replace(":", " "),
                });

                const png = toPng(avatar);
                const dataUri = await png.toArrayBuffer();
                const avatarName = `${uuid()}.png`;

                const command = new PutObjectCommand({
                    Bucket: "",
                    Key: `avatars/${avatarName}`,
                    Body: Buffer.from(dataUri),
                    ContentType: "image/png",
                    ACL: "public-read",
                });

                await s3Client.send(command);

                return {
                    context: {
                        ...ctx,
                        body: {
                            ...ctx.body,
                            image: `https://cdn.lovics.app/avatars/${avatarName}`,
                        },
                    },
                };
            }
        }),
    },
    trustedOrigins: [
        "http://localhost:3000",
        "https://web.lovics.app",
        "lovics://",
        ...(process.env.NODE_ENV === "development"
            ? ["exp://", "exp://**", "exp://192.168.*.*:*/**"]
            : []),
    ],
});

export const betterAuthPlugin = new Elysia({ name: "better-auth" })
    .mount(auth.handler)
    .macro({
        auth: {
            async resolve({ status, request: { headers } }) {
                const session = await auth.api.getSession({
                    headers,
                });
                if (!session) return status(401);
                return {
                    user: session.user,
                    session: session.session,
                };
            },
        },
    });
