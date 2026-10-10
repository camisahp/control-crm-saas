CREATE TABLE "meta_authorization_subject" (
	"app_id" text NOT NULL,
	"user_id" text NOT NULL,
	"revoked_issued_at" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "meta_authorization_subject_app_id_user_id_pk" PRIMARY KEY("app_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "authorization_app_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "authorization_user_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "authorization_issued_at" integer;