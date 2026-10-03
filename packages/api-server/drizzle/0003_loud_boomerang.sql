ALTER TABLE "staff_users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;