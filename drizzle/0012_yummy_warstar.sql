CREATE TABLE "archived_channel_messages" (
	"message_id" varchar(20) PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"author_user_id" varchar(20) NOT NULL,
	"author_username" varchar(100) NOT NULL,
	"author_display_name" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"message_created_at" timestamp NOT NULL,
	"archived_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "archived_messages_timeline_idx" ON "archived_channel_messages" USING btree ("guild_id","channel_id","message_created_at");--> statement-breakpoint
CREATE INDEX "archived_messages_author_timeline_idx" ON "archived_channel_messages" USING btree ("guild_id","channel_id","author_user_id","message_created_at");--> statement-breakpoint
CREATE INDEX "archived_messages_game_idx" ON "archived_channel_messages" USING btree ("guild_id","channel_id","deleted_at","message_created_at");