import { Listener } from "@sapphire/framework";
import type { GuildTextBasedChannel, Message, PartialMessage, ReadonlyCollection, Snowflake } from "discord.js";
import { markArchivedChannelMessagesDeleted } from "../../db/queries/archivedChannelMessages.js";
import { GUESS_WHO_CHANNEL_ID } from "../../lib/constants.js";

export class MessageDeleteBulkListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "messageDeleteBulk" });
	}

	public override async run(
		messages: ReadonlyCollection<Snowflake, Message | PartialMessage>,
		channel: GuildTextBasedChannel,
	) {
		if (channel.id === GUESS_WHO_CHANNEL_ID) {
			await markArchivedChannelMessagesDeleted([...messages.keys()]).catch((err) =>
				this.container.logger.error("[guess-who] Failed to mark bulk-deleted archived messages deleted:", err),
			);
		}
	}
}
