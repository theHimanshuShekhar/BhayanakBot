import { Listener } from "@sapphire/framework";
import type { Message, PartialMessage } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { markArchivedChannelMessageDeleted } from "../../db/queries/archivedChannelMessages.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";
import { GUESS_WHO_CHANNEL_ID } from "../../lib/constants.js";

export class MessageDeleteListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "messageDelete" });
	}

	public override async run(message: Message | PartialMessage) {
		if (message.channelId === GUESS_WHO_CHANNEL_ID) {
			void markArchivedChannelMessageDeleted(message.id).catch((err) =>
				this.container.logger.error("[guess-who] Failed to mark archived message deleted:", err),
			);
		}

		if (message.partial || !message.guild || message.author?.bot) return;

		const client = this.container.client as BhayanakClient;

		// Update snipe cache
		client.snipeCache.set(message.channelId, {
			content: message.content ?? "",
			authorId: message.author?.id ?? "",
			authorTag: message.author?.tag ?? "Unknown",
			authorAvatar: message.author?.displayAvatarURL() ?? null,
			deletedAt: new Date(),
		});

		// Log to log channel
		const settings = await getOrCreateSettings(message.guild.id);
		if (!settings.logChannelId) return;

		const logChannel = message.guild.channels.cache.get(settings.logChannelId);
		if (!logChannel || !("send" in logChannel)) return;

		const embed = new EmbedBuilder()
			.setTitle("Message Deleted")
			.setColor(0xed4245)
			.setAuthor({ name: message.author?.tag ?? "Unknown", iconURL: message.author?.displayAvatarURL() })
			.addFields(
				{ name: "Channel", value: `<#${message.channelId}>`, inline: true },
				{ name: "Author", value: `<@${message.author?.id}>`, inline: true },
			)
			.setTimestamp();

		if (message.content) {
			embed.addFields({ name: "Content", value: message.content.slice(0, 1024) });
		}

		await (logChannel as any).send({ embeds: [embed] }).catch(() => null);
	}
}
