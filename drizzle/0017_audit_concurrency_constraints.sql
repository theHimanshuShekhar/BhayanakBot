ALTER TABLE "polls" ADD CONSTRAINT "polls_message_id_unique" UNIQUE("message_id");
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_message_id_unique" UNIQUE("message_id");

-- Collapse any duplicate inventory rows before enforcing stack uniqueness.
WITH merged AS (
	SELECT MIN("id") AS keep_id, "user_id", "item_id", SUM("quantity") AS total_quantity
	FROM "rpg_inventory"
	GROUP BY "user_id", "item_id"
	HAVING COUNT(*) > 1
)
UPDATE "rpg_inventory" inv
SET "quantity" = merged.total_quantity
FROM merged
WHERE inv."id" = merged.keep_id;

DELETE FROM "rpg_inventory" inv
USING "rpg_inventory" keep
WHERE inv."user_id" = keep."user_id"
	AND inv."item_id" = keep."item_id"
	AND inv."id" > keep."id";

ALTER TABLE "rpg_inventory" ADD CONSTRAINT "rpg_inventory_user_id_item_id_unique" UNIQUE("user_id", "item_id");

DROP INDEX IF EXISTS "idx_user_messages_user_guild";
