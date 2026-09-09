CREATE TABLE "dashboard_presence_snapshots" (
	"name" varchar(50) PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
