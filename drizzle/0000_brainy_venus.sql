CREATE TYPE "public"."auto_mod_action" AS ENUM('warn', 'mute', 'kick');--> statement-breakpoint
CREATE TYPE "public"."auto_response_match_type" AS ENUM('exact', 'contains', 'startsWith');--> statement-breakpoint
CREATE TYPE "public"."mod_case_type" AS ENUM('warn', 'mute', 'unmute', 'kick', 'ban', 'unban', 'tempban');--> statement-breakpoint
CREATE TYPE "public"."reaction_role_type" AS ENUM('normal', 'toggle', 'unique');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "afk_users" (
	"user_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"reason" text,
	"set_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"trigger" text NOT NULL,
	"response" text NOT NULL,
	"match_type" "auto_response_match_type" DEFAULT 'contains' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giveaways" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"prize" text NOT NULL,
	"winner_count" integer DEFAULT 1 NOT NULL,
	"ends_at" timestamp NOT NULL,
	"ended" boolean DEFAULT false NOT NULL,
	"host_id" varchar(20) NOT NULL,
	"winners" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"guild_id" varchar(20) PRIMARY KEY NOT NULL,
	"welcome_channel_id" varchar(20),
	"goodbye_channel_id" varchar(20),
	"log_channel_id" varchar(20),
	"level_up_channel_id" varchar(20),
	"music_channel_id" varchar(20),
	"starboard_channel_id" varchar(20),
	"ticket_category_id" varchar(20),
	"auto_role" varchar(20),
	"muted_role_id" varchar(20),
	"ticket_support_role_id" varchar(20),
	"dj_role_id" varchar(20),
	"moderator_role_id" varchar(20),
	"welcome_message" text,
	"goodbye_message" text,
	"level_up_message" text,
	"star_threshold" integer DEFAULT 3 NOT NULL,
	"xp_rate" integer DEFAULT 15 NOT NULL,
	"xp_cooldown_seconds" integer DEFAULT 60 NOT NULL,
	"auto_mod_enabled" boolean DEFAULT false NOT NULL,
	"auto_mod_spam_threshold" integer DEFAULT 5,
	"auto_mod_bad_links" boolean DEFAULT false NOT NULL,
	"auto_mod_max_mentions" integer DEFAULT 5,
	"auto_mod_action" "auto_mod_action" DEFAULT 'warn',
	"auto_mod_mute_duration" integer DEFAULT 300000,
	"anti_raid_enabled" boolean DEFAULT false NOT NULL,
	"anti_raid_join_threshold" integer DEFAULT 10,
	"anti_raid_join_window" integer DEFAULT 10
);
--> statement-breakpoint
CREATE TABLE "level_rewards" (
	"guild_id" varchar(20) NOT NULL,
	"level" integer NOT NULL,
	"role_id" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mod_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" integer NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"moderator_id" varchar(20) NOT NULL,
	"type" "mod_case_type" NOT NULL,
	"reason" text,
	"duration" integer,
	"expires_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction_roles" (
	"message_id" varchar(20) NOT NULL,
	"emoji" varchar(100) NOT NULL,
	"role_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"type" "reaction_role_type" DEFAULT 'normal' NOT NULL,
	"group_id" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"remind_at" timestamp NOT NULL,
	"sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_menu_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_id" integer NOT NULL,
	"role_id" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" varchar(100),
	"emoji" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "role_menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"placeholder" varchar(150),
	"min_values" integer DEFAULT 0 NOT NULL,
	"max_values" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "starred_messages" (
	"message_id" varchar(20) PRIMARY KEY NOT NULL,
	"starboard_message_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"star_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"response" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"subject" text,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"claimed_by" varchar(20),
	"claimed_at" timestamp,
	"transcript_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"closed_by" varchar(20)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp
);
