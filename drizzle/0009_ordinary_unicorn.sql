ALTER TABLE "guild_settings" ADD COLUMN "random_response_channel_id" varchar(20);--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "random_response_chance" integer DEFAULT 0 NOT NULL;