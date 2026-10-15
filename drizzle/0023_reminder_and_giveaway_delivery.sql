ALTER TABLE "giveaways" ADD COLUMN "announced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "giveaways" ADD COLUMN "announce_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "giveaways" ADD COLUMN "announce_attempted_at" timestamp;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "next_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "failed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Giveaways that ended before this migration were already announced (or never will be); do not re-announce them.
UPDATE "giveaways" SET "announced" = true WHERE "ended" = true;
