DROP TABLE "reaction_roles" CASCADE;--> statement-breakpoint
DROP TABLE "role_menu_options" CASCADE;--> statement-breakpoint
DROP TABLE "role_menus" CASCADE;--> statement-breakpoint
DROP TABLE "suggestions" CASCADE;--> statement-breakpoint
DROP TABLE "tickets" CASCADE;--> statement-breakpoint
ALTER TABLE "guild_settings" DROP COLUMN "ticket_category_id";--> statement-breakpoint
ALTER TABLE "guild_settings" DROP COLUMN "ticket_support_role_id";--> statement-breakpoint
DROP TYPE "public"."reaction_role_type";--> statement-breakpoint
DROP TYPE "public"."suggestion_status";--> statement-breakpoint
DROP TYPE "public"."ticket_status";