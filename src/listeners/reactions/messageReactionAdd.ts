import { Listener } from "@sapphire/framework";
import type { MessageReaction, User } from "discord.js";
import { getReactionRole, getMessageReactionRoles } from "../../db/queries/roles.js";
import { db } from "../../lib/database.js";
import { starredMessages, guildSettings } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

export class MessageReactionAddListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "messageReactionAdd" });
	}

	public override async run(reaction: MessageReaction, user: User) {
		if (user.bot) return;

		// Resolve partials
		if (reaction.partial) await reaction.fetch().catch(() => null);
		if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

		const guild = reaction.message.guild;
		if (!guild) return;

		const emojiKey = reaction.emoji.id ?? reaction.emoji.name ?? "";

		// --- Reaction Roles ---
		const reactionRole = await getReactionRole(reaction.message.id, emojiKey);
		if (reactionRole) {
			const member = await guild.members.fetch(user.id).catch(() => null);
			if (!member) return;

			if (reactionRole.type === "unique" && reactionRole.groupId) {
				// Remove other roles in the same group
				const groupRoles = await getMessageReactionRoles(reaction.message.id);
				const sameGroup = groupRoles.filter((r) => r.groupId === reactionRole.groupId && r.roleId !== reactionRole.roleId);
				for (const r of sameGroup) {
					await member.roles.remove(r.roleId).catch(() => null);
				}
			} else if (reactionRole.type === "toggle" && member.roles.cache.has(reactionRole.roleId)) {
				await member.roles.remove(reactionRole.roleId).catch(() => null);
				await reaction.users.remove(user.id).catch(() => null);
				return;
			}

			await member.roles.add(reactionRole.roleId).catch(() => null);
			return;
		}

		// --- Starboard ---
		if (emojiKey === "⭐") {
			await this.handleStarboard(reaction, guild);
		}
	}

	private async handleStarboard(reaction: MessageReaction, guild: import("discord.js").Guild) {
		const settings = await db.query.guildSettings.findFirst({
			where: eq(guildSettings.guildId, guild.id),
		});

		if (!settings?.starboardChannelId) return;

		const starCount = reaction.count ?? 0;
		if (starCount < (settings.starThreshold ?? 3)) return;

		const message = reaction.message;
		const existing = await db.query.starredMessages.findFirst({
			where: eq(starredMessages.messageId, message.id),
		});

		const starboardChannel = guild.channels.cache.get(settings.starboardChannelId);
		if (!starboardChannel || !("send" in starboardChannel)) return;

		const content = [
			`⭐ **${starCount}** | <#${message.channelId}>`,
			message.content ? `\n${message.content}` : "",
		]
			.join("")
			.trim();

		const attachment = message.attachments.first();
		const embed = {
			color: 0xffd700,
			author: {
				name: message.author?.tag ?? "Unknown",
				icon_url: message.author?.displayAvatarURL(),
			},
			description: message.content || undefined,
			image: attachment ? { url: attachment.url } : undefined,
			footer: { text: `Message ID: ${message.id}` },
			timestamp: message.createdAt.toISOString(),
		};

		if (existing) {
			// Update star count on existing starboard post
			const sbChannel = starboardChannel as import("discord.js").TextChannel;
			const sbMsg = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
			if (sbMsg) {
				await sbMsg.edit({ content, embeds: [embed] }).catch(() => null);
			}
			await db
				.update(starredMessages)
				.set({ starCount })
				.where(eq(starredMessages.messageId, message.id));
		} else {
			const sbMsg = await (starboardChannel as any).send({ content, embeds: [embed] }).catch(() => null);
			if (sbMsg) {
				await db.insert(starredMessages).values({
					messageId: message.id,
					starboardMessageId: sbMsg.id,
					guildId: guild.id,
					starCount,
				});
			}
		}
	}
}
