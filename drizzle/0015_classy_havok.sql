ALTER TABLE "guild_personality_profiles" ADD COLUMN "last_training_message_at" timestamp;--> statement-breakpoint
ALTER TABLE "guild_personality_profiles" ADD COLUMN "last_training_message_id" varchar(20);--> statement-breakpoint
ALTER TABLE "user_personality_profiles" ADD COLUMN "last_training_message_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_personality_profiles" ADD COLUMN "last_training_message_id" varchar(20);