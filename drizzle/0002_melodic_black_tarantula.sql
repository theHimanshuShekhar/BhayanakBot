ALTER TABLE "level_rewards" ADD CONSTRAINT "level_rewards_guild_id_level_pk" PRIMARY KEY("guild_id","level");--> statement-breakpoint
ALTER TABLE "reaction_roles" ADD CONSTRAINT "reaction_roles_message_id_emoji_pk" PRIMARY KEY("message_id","emoji");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_user_id_guild_id_pk" PRIMARY KEY("user_id","guild_id");--> statement-breakpoint
ALTER TABLE "rpg_owned_properties" ADD CONSTRAINT "rpg_owned_properties_user_id_property_id_unique" UNIQUE("user_id","property_id");