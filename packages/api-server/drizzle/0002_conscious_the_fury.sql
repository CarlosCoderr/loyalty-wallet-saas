CREATE TYPE "public"."program_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "code" varchar(50);--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "reward_description" text;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "status" "program_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_code_uq" UNIQUE("tenant_id","code");