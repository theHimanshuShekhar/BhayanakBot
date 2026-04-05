import { Listener } from "@sapphire/framework";
import type { Message, PartialMessage } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";

export class MessageUpdateListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "messageUpdate" });
	}

	public override async run(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
		if (oldMessage.partial || newMessage.partial) return;
		if (!newMessage.guild || newMessage.author?.bot) return;
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
