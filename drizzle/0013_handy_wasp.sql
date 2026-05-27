CREATE TABLE "bot_command_counters" (
	"name" varchar(50) PRIMARY KEY NOT NULL,
	"commands_run" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_bot_stats_snapshots" (
	"name" varchar(50) PRIMARY KEY NOT NULL,
	"guilds" integer DEFAULT 0 NOT NULL,
	"commands_run" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
