CREATE TYPE "public"."auto_response_type" AS ENUM('static', 'llm');--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "response_type" "auto_response_type" DEFAULT 'static' NOT NULL;