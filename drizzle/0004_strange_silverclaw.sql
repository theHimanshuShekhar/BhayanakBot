CREATE TYPE "public"."quest_objective_type" AS ENUM('work', 'crime', 'train');--> statement-breakpoint
CREATE TABLE "daily_quests" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"title" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"objective_type" "quest_objective_type" NOT NULL,
	"objective_job" varchar(50),
	"objective_count" integer DEFAULT 1 NOT NULL,
	"reward_coins" integer DEFAULT 500 NOT NULL,
	"reward_xp" integer DEFAULT 100 NOT NULL,
	"date" varchar(10) NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_portraits" (
	"pet_id" varchar(50) PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_progress" (
	"quest_id" integer NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "quest_progress_quest_id_user_id_pk" PRIMARY KEY("quest_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "rpg_profiles" ADD COLUMN "portrait_url" text;