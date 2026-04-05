import { Listener } from "@sapphire/framework";
import { type GuildMember, EmbedBuilder, TextChannel } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";

export class GuildMemberAddListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "guildMemberAdd" });
	}

	public async run(member: GuildMember) {
		const settings = await getOrCreateSettings(member.guild.id);

		// Anti-raid detection
		if (settings.antiRaidEnabled) {
			const client = this.container.client as BhayanakClient;
			const now = Date.now();
			const window = (settings.antiRaidJoinWindow ?? 10) * 1000;
			const threshold = settings.antiRaidJoinThreshold ?? 10;

			const joins = client.recentJoins.get(member.guild.id) ?? [];
			const recentJoins = [...joins.filter((t) => now - t < window), now];
			client.recentJoins.set(member.guild.id, recentJoins);

			if (recentJoins.length >= threshold) {
				// Kick the member as part of raid protection
				try {
					await member.kick("Anti-raid: mass join detected");
					if (settings.logChannelId) {
						const logChannel = member.guild.channels.cache.get(settings.logChannelId) as TextChannel | undefined;
						await logChannel?.send(`🚨 **Anti-Raid:** Kicked ${member.user.tag} during mass join event (${recentJoins.length} joins in ${settings.antiRaidJoinWindow}s).`);
					}
				} catch {
					// Insufficient permissions — log and continue
				}
				return;
			}
		}

		// Assign auto-role
		if (settings.autoRole) {
			const role = member.guild.roles.cache.get(settings.autoRole);
			if (role) {
				try {
					await member.roles.add(role);
				} catch {
					// Role may have been deleted or bot lacks permission
				}
			}
		}

		// Welcome message
		if (settings.welcomeChannelId) {
			const channel = member.guild.channels.cache.get(settings.welcomeChannelId) as TextChannel | undefined;
			if (channel) {
				const message = (settings.welcomeMessage ?? "Welcome {user} to **{server}**! You are member #{count}.")
					.replace("{user}", `<@${member.id}>`)
					.replace("{server}", member.guild.name)
					.replace("{count}", member.guild.memberCount.toString())
					.replace("{username}", member.user.username);

				const embed = new EmbedBuilder()
					.setColor(0x57f287)
					.setTitle(`Welcome to ${member.guild.name}!`)
					.setDescription(message)
					.setThumbnail(member.user.displayAvatarURL())
					.setTimestamp();

				await channel.send({ embeds: [embed] }).catch(() => null);
			}
		}
	}
}
