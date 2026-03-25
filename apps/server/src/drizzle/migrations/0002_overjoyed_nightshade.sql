ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "public_key";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "encrypted_private_key";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "encrypted_private_key_recovery";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "encryption_salt";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");