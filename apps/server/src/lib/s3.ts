import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
    region: "fra1",
    endpoint: "https://cdn.lovics.app",
    credentials: {
        accessKeyId: process.env.SPACES_ACCESS_KEY!,
        secretAccessKey: process.env.SPACES_SECRET_KEY!,
    },
    bucketEndpoint: false,
});

export const BUCKET_NAME = "";
