CREATE TABLE "user_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_user_messages_user_guild" ON "user_messages" ("user_id","guild_id");
--> statement-breakpoint
CREATE TABLE "user_personality_profiles" (
	"user_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"profile" text,
	"new_message_count" integer DEFAULT 0 NOT NULL,
	"last_refreshed_at" timestamp,
	CONSTRAINT "user_personality_profiles_user_id_guild_id_pk" PRIMARY KEY("user_id","guild_id")
);
