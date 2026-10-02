CREATE TYPE "public"."pass_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('basic', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'cashier');--> statement-breakpoint
CREATE TYPE "public"."stamp_rule_type" AS ENUM('per_amount', 'per_visit');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('add_stamp', 'redeem_reward');--> statement-breakpoint
CREATE TABLE "apple_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_library_identifier" varchar(255) NOT NULL,
	"push_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_devices_tenant_device_uq" UNIQUE("tenant_id","device_library_identifier")
);
--> statement-breakpoint
CREATE TABLE "apple_registrations" (
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"pass_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_registrations_device_id_pass_id_pk" PRIMARY KEY("device_id","pass_id")
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"api_key_hash" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" varchar(50) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100),
	"email" varchar(255),
	"birth_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_tenant_phone_uq" UNIQUE("tenant_id","phone")
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"stamp_rule_type" "stamp_rule_type" DEFAULT 'per_amount' NOT NULL,
	"amount_per_stamp" numeric(10, 2) DEFAULT '10.00' NOT NULL,
	"min_purchase_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_stamps" integer DEFAULT 10 NOT NULL,
	"reward_title" varchar(255) NOT NULL,
	"primary_color" varchar(20) DEFAULT '#000000' NOT NULL,
	"background_color" varchar(20) DEFAULT '#FFFFFF' NOT NULL,
	"label_color" varchar(20) DEFAULT '#000000' NOT NULL,
	"logo_url" text,
	"stamp_icon_url" text,
	"banner_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_programs_total_stamps_chk" CHECK ("loyalty_programs"."total_stamps" > 0),
	CONSTRAINT "loyalty_programs_amount_per_stamp_chk" CHECK ("loyalty_programs"."amount_per_stamp" > 0),
	CONSTRAINT "loyalty_programs_min_purchase_chk" CHECK ("loyalty_programs"."min_purchase_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"serial_number" varchar(100) NOT NULL,
	"authentication_token" varchar(64) NOT NULL,
	"current_stamps" integer DEFAULT 0 NOT NULL,
	"carryover_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"rewards_redeemed" integer DEFAULT 0 NOT NULL,
	"google_loyalty_object_id" text,
	"status" "pass_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passes_serial_number_unique" UNIQUE("serial_number"),
	CONSTRAINT "passes_program_customer_uq" UNIQUE("program_id","customer_id"),
	CONSTRAINT "passes_current_stamps_chk" CHECK ("passes"."current_stamps" >= 0)
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"pin_hash" varchar(255),
	"role" "staff_role" DEFAULT 'cashier' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_tenant_email_uq" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"owner_email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"plan_tier" "plan_tier" DEFAULT 'basic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pass_id" uuid NOT NULL,
	"staff_id" uuid,
	"branch_id" uuid,
	"type" "transaction_type" NOT NULL,
	"purchase_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"stamps_added" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apple_devices" ADD CONSTRAINT "apple_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_registrations" ADD CONSTRAINT "apple_registrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_registrations" ADD CONSTRAINT "apple_registrations_device_id_apple_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."apple_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_registrations" ADD CONSTRAINT "apple_registrations_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_program_id_loyalty_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apple_registrations_pass_idx" ON "apple_registrations" USING btree ("pass_id");--> statement-breakpoint
CREATE INDEX "branches_tenant_idx" ON "branches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "loyalty_programs_tenant_idx" ON "loyalty_programs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "passes_tenant_idx" ON "passes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "passes_customer_idx" ON "passes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "staff_users_branch_idx" ON "staff_users" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "transactions_tenant_created_idx" ON "transactions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_pass_idx" ON "transactions" USING btree ("pass_id");