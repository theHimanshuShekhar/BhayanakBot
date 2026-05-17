CREATE TABLE "guild_personality_profiles" (
	"guild_id" varchar(20) PRIMARY KEY NOT NULL,
	"profile" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_refreshed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "rpg_stats" ALTER COLUMN "strength" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "rpg_stats" ALTER COLUMN "intelligence" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "rpg_stats" ALTER COLUMN "agility" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "rpg_stats" ALTER COLUMN "charisma" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "rpg_stats" ALTER COLUMN "luck" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "afk_users" ADD CONSTRAINT "afk_users_user_id_guild_id_pk" PRIMARY KEY("user_id","guild_id");--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "use_regex" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "channel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "require_mention" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "chance_percent" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "delete_trigger" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rpg_profiles" ADD COLUMN "daily_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rpg_profiles" ADD COLUMN "last_daily_at" timestamp;--> statement-breakpoint
CREATE INDEX "user_messages_user_id_guild_id_index" ON "user_messages" USING btree ("user_id","guild_id");