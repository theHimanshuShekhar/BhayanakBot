import { Listener } from "@sapphire/framework";
import { type GuildMember, EmbedBuilder, TextChannel } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";

export class GuildMemberRemoveListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "guildMemberRemove" });
	}

	public async run(member: GuildMember) {
		const settings = await getOrCreateSettings(member.guild.id);
		if (!settings.goodbyeChannelId) return;

		const channel = member.guild.channels.cache.get(settings.goodbyeChannelId) as TextChannel | undefined;
		if (!channel) return;

		const message = (settings.goodbyeMessage ?? "**{username}** has left the server. We now have {count} members.")
			.replace("{user}", `<@${member.id}>`)
			.replace("{username}", member.user.username)
			.replace("{server}", member.guild.name)
			.replace("{count}", member.guild.memberCount.toString());

		const embed = new EmbedBuilder()
			.setColor(0xed4245)
			.setTitle("Member Left")
			.setDescription(message)
			.setThumbnail(member.user.displayAvatarURL())
			.setTimestamp();

		await channel.send({ embeds: [embed] }).catch(() => null);
	}
}
