CREATE TYPE "public"."reward_status" AS ENUM('pending', 'redeemed');--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pass_id" uuid NOT NULL,
	"reward_title" varchar(255) NOT NULL,
	"status" "reward_status" DEFAULT 'pending' NOT NULL,
	"earned_transaction_id" uuid,
	"redeemed_transaction_id" uuid,
	"redeemed_by_staff_id" uuid,
	"redeemed_at_branch_id" uuid,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "reward_redemptions_redeemed_chk" CHECK (("reward_redemptions"."status" = 'pending' AND "reward_redemptions"."redeemed_at" IS NULL) OR ("reward_redemptions"."status" = 'redeemed' AND "reward_redemptions"."redeemed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_earned_transaction_id_transactions_id_fk" FOREIGN KEY ("earned_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_redeemed_transaction_id_transactions_id_fk" FOREIGN KEY ("redeemed_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_redeemed_by_staff_id_staff_users_id_fk" FOREIGN KEY ("redeemed_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_redeemed_at_branch_id_branches_id_fk" FOREIGN KEY ("redeemed_at_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_redemptions_pass_status_idx" ON "reward_redemptions" USING btree ("pass_id","status");--> statement-breakpoint
CREATE INDEX "reward_redemptions_tenant_idx" ON "reward_redemptions" USING btree ("tenant_id");