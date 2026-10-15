CREATE INDEX IF NOT EXISTS "auto_responses_guild_idx" ON "auto_responses" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "giveaways_running_ends_at_idx" ON "giveaways" USING btree ("ends_at") WHERE "giveaways"."ended" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "giveaways_unannounced_attempted_idx" ON "giveaways" USING btree ("announce_attempted_at") WHERE "giveaways"."ended" = true and "giveaways"."announced" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mod_cases_guild_user_created_idx" ON "mod_cases" USING btree ("guild_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mod_cases_active_expiry_idx" ON "mod_cases" USING btree ("type","expires_at") WHERE "mod_cases"."active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "polls_open_expires_idx" ON "polls" USING btree ("expires_at") WHERE "polls"."closed" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_pending_remind_at_idx" ON "reminders" USING btree ("remind_at") WHERE "reminders"."sent" = false and "reminders"."failed" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_guild_xp_idx" ON "users" USING btree ("guild_id","xp" DESC NULLS FIRST);--> statement-breakpoint
-- Read-only role for the website: SELECT on the two snapshot tables it reads, nothing else. Created without a
-- password, so it cannot log in until the operator runs `ALTER ROLE bhayanak_web PASSWORD '...'` (see README).
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bhayanak_web') THEN
		CREATE ROLE bhayanak_web LOGIN;
	END IF;
EXCEPTION WHEN duplicate_object THEN
	NULL; -- another migration run created it between the check and the CREATE
END
$$;--> statement-breakpoint
DO $$
BEGIN
	EXECUTE format('GRANT CONNECT ON DATABASE %I TO bhayanak_web', current_database());
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO bhayanak_web;--> statement-breakpoint
GRANT SELECT ON "public_bot_stats_snapshots", "dashboard_presence_snapshots" TO bhayanak_web;
