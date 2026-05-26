import { ChannelType, type Client, type TextChannel } from "discord.js";
import { upsertArchivedChannelMessage } from "../../db/queries/archivedChannelMessages.js";
import { GUESS_WHO_BACKFILL_LIMIT, GUESS_WHO_CHANNEL_ID } from "../constants.js";

export async function backfillGuessWhoMessages(client: Client): Promise<number> {
	const channel = await client.channels.fetch(GUESS_WHO_CHANNEL_ID).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildText) return 0;

	let before: string | undefined;
	let scanned = 0;
	let imported = 0;
	const limit = Math.max(0, GUESS_WHO_BACKFILL_LIMIT);

	while (scanned < limit) {
		const batchSize = Math.min(100, limit - scanned);
		const messages = await (channel as TextChannel).messages.fetch({ limit: batchSize, before });
		if (messages.size === 0) break;

		for (const message of messages.values()) {
			before = message.id;
			scanned++;
			if (message.author.bot || !message.guild) continue;

			await upsertArchivedChannelMessage({
				messageId: message.id,
				guildId: message.guild.id,
				channelId: message.channelId,
				authorUserId: message.author.id,
				authorUsername: message.author.username,
				authorDisplayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
				content: message.content,
				messageCreatedAt: message.createdAt,
				editedAt: message.editedAt,
			});
			imported++;
			if (scanned >= limit) break;
		}

		if (messages.size < batchSize) break;
	}

	return imported;
}
