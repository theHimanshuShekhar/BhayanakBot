import { Listener } from "@sapphire/framework";
import type { Message, PartialMessage } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { markArchivedChannelMessageEdited } from "../../db/queries/archivedChannelMessages.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";
import { GUESS_WHO_CHANNEL_ID } from "../../lib/constants.js";

export class MessageUpdateListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "messageUpdate" });
	}

	public override async run(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
		if (newMessage.channelId === GUESS_WHO_CHANNEL_ID && newMessage.partial) {
			const fetched = await newMessage.fetch().catch(() => null);
			if (fetched?.guild && !fetched.author?.bot) {
				void markArchivedChannelMessageEdited({
					messageId: fetched.id,
					guildId: fetched.guild.id,
					channelId: fetched.channelId,
					authorUserId: fetched.author.id,
					authorUsername: fetched.author.username,
					authorDisplayName: fetched.member?.displayName ?? fetched.author.globalName ?? fetched.author.username,
					content: fetched.content,
					messageCreatedAt: fetched.createdAt,
					editedAt: fetched.editedAt ?? new Date(),
				}).catch((err) => this.container.logger.error("[guess-who] Failed to archive edited message:", err));
			}
		}

		if (!newMessage.guild || !newMessage.author || newMessage.author.bot || newMessage.content === null) return;
		if (newMessage.channelId === GUESS_WHO_CHANNEL_ID && (oldMessage.partial || oldMessage.content !== newMessage.content)) {
			void markArchivedChannelMessageEdited({
				messageId: newMessage.id,
				guildId: newMessage.guild.id,
				channelId: newMessage.channelId,
				authorUserId: newMessage.author.id,
				authorUsername: newMessage.author.username,
				authorDisplayName: newMessage.member?.displayName ?? newMessage.author.globalName ?? newMessage.author.username,
				content: newMessage.content,
				messageCreatedAt: newMessage.createdAt,
				editedAt: newMessage.editedAt ?? new Date(),
			}).catch((err) => this.container.logger.error("[guess-who] Failed to archive edited message:", err));
		}

		if (oldMessage.partial || newMessage.partial) return;
		if (oldMessage.content === newMessage.content) return;

		const client = this.container.client as BhayanakClient;

		// Update editsnipe cache
		client.editSnipeCache.set(newMessage.channelId, {
			oldContent: oldMessage.content ?? "",
			newContent: newMessage.content ?? "",
			authorId: newMessage.author?.id ?? "",
			authorTag: newMessage.author?.tag ?? "Unknown",
			authorAvatar: newMessage.author?.displayAvatarURL() ?? null,
			editedAt: new Date(),
		});

		// Log to log channel
		const settings = await getOrCreateSettings(newMessage.guild.id);
		if (!settings.logChannelId) return;

		const logChannel = newMessage.guild.channels.cache.get(settings.logChannelId);
		if (!logChannel || !("send" in logChannel)) return;

		const embed = new EmbedBuilder()
			.setTitle("Message Edited")
			.setColor(0xfee75c)
			.setAuthor({ name: newMessage.author?.tag ?? "Unknown", iconURL: newMessage.author?.displayAvatarURL() })
			.addFields(
				{ name: "Channel", value: `<#${newMessage.channelId}>`, inline: true },
				{ name: "Author", value: `<@${newMessage.author?.id}>`, inline: true },
				{ name: "Before", value: (oldMessage.content || "*empty*").slice(0, 1024) },
				{ name: "After", value: (newMessage.content || "*empty*").slice(0, 1024) },
			)
			.setTimestamp();

		await (logChannel as any).send({ embeds: [embed] }).catch(() => null);
	}
}
