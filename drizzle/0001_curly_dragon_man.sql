CREATE TABLE "rpg_cooldowns" (
	"user_id" varchar(20) NOT NULL,
	"action" varchar(50) NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "rpg_cooldowns_user_id_action_pk" PRIMARY KEY("user_id","action")
);
--> statement-breakpoint
CREATE TABLE "rpg_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"item_id" varchar(50) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"equipped_slot" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "rpg_owned_pets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"pet_id" varchar(50) NOT NULL,
	"nickname" varchar(32),
	"acquired_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpg_owned_properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"property_id" varchar(50) NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"last_collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpg_profiles" (
	"user_id" varchar(20) PRIMARY KEY NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"jail_until" timestamp,
	"jail_bail_cost" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpg_stats" (
	"user_id" varchar(20) PRIMARY KEY NOT NULL,
	"strength" integer DEFAULT 1 NOT NULL,
	"intelligence" integer DEFAULT 1 NOT NULL,
	"agility" integer DEFAULT 1 NOT NULL,
	"charisma" integer DEFAULT 1 NOT NULL,
	"luck" integer DEFAULT 1 NOT NULL,
	"str_trained_at" timestamp,
	"int_trained_at" timestamp,
	"agi_trained_at" timestamp,
	"cha_trained_at" timestamp,
	"luk_trained_at" timestamp
);
