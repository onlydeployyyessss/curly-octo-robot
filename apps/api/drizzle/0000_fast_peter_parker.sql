CREATE TABLE IF NOT EXISTS "action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT '2026-08-27T09:10:42.851Z' NOT NULL,
	"creator_id" uuid,
	"account_id" uuid,
	"campaign_id" uuid,
	"action_type" text NOT NULL,
	"campaign_day" integer,
	"content" text,
	"metadata" jsonb,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.852Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT '2026-08-27T09:10:42.852Z' NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"ip" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"dm_enabled" boolean DEFAULT true NOT NULL,
	"comment_enabled" boolean DEFAULT true NOT NULL,
	"dm_content" text,
	"comment_content" text,
	"dm_sent_at" timestamp with time zone,
	"comment_sent_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"account_id" uuid,
	"status" text DEFAULT 'waiting' NOT NULL,
	"current_day" integer DEFAULT 0 NOT NULL,
	"max_days" integer DEFAULT 5 NOT NULL,
	"dm_enabled" boolean DEFAULT true NOT NULL,
	"comment_enabled" boolean DEFAULT true NOT NULL,
	"scheduled_time" time DEFAULT '10:00' NOT NULL,
	"stop_conditions" jsonb DEFAULT '{"onReply":true,"onPositive":true,"onDecline":true}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.850Z' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.850Z' NOT NULL,
	CONSTRAINT "campaigns_creator_id_unique" UNIQUE("creator_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"account_id" uuid,
	"platform" text NOT NULL,
	"thread_external_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.851Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"profile_url" text,
	"ig_id" text,
	"account_id" uuid,
	"status" text DEFAULT 'waiting' NOT NULL,
	"response_status" text DEFAULT 'none' NOT NULL,
	"start_date" date,
	"current_day" integer DEFAULT 0 NOT NULL,
	"max_days" integer DEFAULT 5 NOT NULL,
	"dm_enabled" boolean DEFAULT true NOT NULL,
	"comment_enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"excluded" boolean DEFAULT false NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"last_dm_at" timestamp with time zone,
	"last_comment_at" timestamp with time zone,
	"last_response_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.849Z' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.849Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_date" date NOT NULL,
	"stats" jsonb NOT NULL,
	"message" text NOT NULL,
	"sent" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.852Z' NOT NULL,
	CONSTRAINT "daily_reports_report_date_unique" UNIQUE("report_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "excluded_creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.851Z' NOT NULL,
	CONSTRAINT "excluded_creators_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instagram_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text,
	"ig_user_id" text,
	"account_type" text,
	"access_token_enc" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'connected' NOT NULL,
	"scopes" text,
	"page_id" text,
	"profile_json" jsonb,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.848Z' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.848Z' NOT NULL,
	CONSTRAINT "instagram_accounts_ig_user_id_unique" UNIQUE("ig_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"day_number" integer,
	"content" text NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.850Z' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.850Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"account_id" uuid,
	"conversation_id" uuid,
	"platform" text NOT NULL,
	"external_id" text,
	"text" text NOT NULL,
	"our_text" text,
	"media_ref" text,
	"sentiment" text DEFAULT 'unknown' NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"ts" timestamp with time zone DEFAULT '2026-08-27T09:10:42.851Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"type" text NOT NULL,
	"creator_id" uuid,
	"campaign_id" uuid,
	"account_id" uuid,
	"campaign_day" integer,
	"payload" jsonb,
	"scheduled_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.850Z' NOT NULL,
	"next_retry_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"error_class" text,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.850Z' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.850Z' NOT NULL,
	CONSTRAINT "scheduled_actions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.848Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT '2026-08-27T09:10:42.852Z' NOT NULL,
	"service" text NOT NULL,
	"error_class" text,
	"message" text NOT NULL,
	"context" jsonb,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"chat_id" text,
	"report_time" time DEFAULT '09:00' NOT NULL,
	"daily_report_enabled" boolean DEFAULT true NOT NULL,
	"instant_alerts_enabled" boolean DEFAULT true NOT NULL,
	"authorized_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"webhook_url" text,
	"last_report_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.851Z' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT '2026-08-27T09:10:42.847Z' NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_days" ADD CONSTRAINT "campaign_days_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creators" ADD CONSTRAINT "creators_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replies" ADD CONSTRAINT "replies_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replies" ADD CONSTRAINT "replies_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replies" ADD CONSTRAINT "replies_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logs_ts" ON "action_logs" USING btree ("ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logs_creator" ON "action_logs" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logs_account" ON "action_logs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logs_type" ON "action_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_logs_status" ON "action_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_ts" ON "audit_logs" USING btree ("ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_user" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_campaign_days_campaign_day" ON "campaign_days" USING btree ("campaign_id","day_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaigns_status" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaigns_account" ON "campaigns" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_conversations_thread" ON "conversations" USING btree ("creator_id","platform","thread_external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_creators_username" ON "creators" USING btree ("username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creators_status" ON "creators" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creators_account" ON "creators" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creators_response" ON "creators" USING btree ("response_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reports_date" ON "daily_reports" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ig_accounts_status" ON "instagram_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ig_accounts_ig_user_id" ON "instagram_accounts" USING btree ("ig_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_templates_channel_day" ON "message_templates" USING btree ("channel","day_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_replies_creator" ON "replies" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_replies_ts" ON "replies" USING btree ("ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_replies_account" ON "replies" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_replies_platform" ON "replies" USING btree ("platform");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_scheduled_idem" ON "scheduled_actions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_due" ON "scheduled_actions" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_retry" ON "scheduled_actions" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_creator" ON "scheduled_actions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_type" ON "scheduled_actions" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_errors_ts" ON "system_errors" USING btree ("ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_errors_service" ON "system_errors" USING btree ("service");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_errors_resolved" ON "system_errors" USING btree ("resolved");