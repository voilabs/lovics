ALTER TABLE "vault_members" ALTER COLUMN "encrypted_vault_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_members" ALTER COLUMN "salt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_contents" ADD COLUMN "createdBy" varchar;--> statement-breakpoint
ALTER TABLE "vault_contents" ADD CONSTRAINT "vault_contents_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;