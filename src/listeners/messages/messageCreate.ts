import { Listener } from "@sapphire/framework";
import { type Message, EmbedBuilder, PermissionFlagsBits, TextChannel } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { addXp } from "../../db/queries/users.js";
import { createCase } from "../../db/queries/modCases.js";
import { getAfk, clearAfk } from "../../db/queries/afk.js";
import { findMatchingResponse } from "../../db/queries/autoResponses.js";
import { storeUserMessage, incrementMessageCount } from "../../db/queries/personality.js";
import { generateAutoResponse } from "../../lib/autoresponder/llmResponse.js";
import { buildPersonalityProfile } from "../../lib/personality/buildProfile.js";
import { getPersonalityContext } from "../../lib/personality/getPersonalityContext.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";

// Spam tracking: Map<guildId:userId, { count, resetAt }>
const spamTracker = new Map<string, { count: number; resetAt: number }>();

// Prevents concurrent profile rebuilds when two messages arrive simultaneously and both see count >= 100
const profileRebuildInProgress = new Set<string>();

// Auto-responder cooldown: Map<guildId:trigger, lastFiredAt>
const autoResponderCooldown = new Map<string, number>();
const AUTO_RESPONDER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

const BAD_LINK_PATTERN = /https?:\/\/(discord\.gg|discordapp\.com\/invite|bit\.ly|tinyurl\.com)\//i;

export class MessageCreateListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "messageCreate" });
	}

	public async run(message: Message) {
		if (message.author.bot || !message.guild) return;

		const settings = await getOrCreateSettings(message.guild.id);

		// --- Personality profiling: store message + trigger rebuild when threshold hit ---
		// Skip empty messages and command invocations
		const trimmedContent = message.content.trim();
		if (settings.personalityEnabled && trimmedContent.length > 0 && !trimmedContent.startsWith("/")) {
			await storeUserMessage(message.author.id, message.guild.id, trimmedContent);
			const count = await incrementMessageCount(message.author.id, message.guild.id);
			const rebuildKey = `${message.author.id}:${message.guild.id}`;
			if (count >= 100 && !profileRebuildInProgress.has(rebuildKey)) {
				profileRebuildInProgress.add(rebuildKey);
				const guildId = message.guild.id;
				void buildPersonalityProfile(message.author.id, guildId)
					.catch((err) =>
						this.container.logger.error(
							`[personality] Inline build failed for userId=${message.author.id} guildId=${guildId}:`,
							err,
						),
					)
					.finally(() => profileRebuildInProgress.delete(rebuildKey));
			}
		}

		// --- AFK clear ---
		const afk = await getAfk(message.author.id, message.guild.id);
		if (afk) {
			await clearAfk(message.author.id, message.guild.id);
			await message.reply(`Welcome back, <@${message.author.id}>! I removed your AFK status.`).then((m) => setTimeout(() => m.delete().catch(() => null), 5000));
		}

		// --- Notify AFK users who are mentioned ---
		for (const [, mentionedUser] of message.mentions.users) {
			const mentionedAfk = await getAfk(mentionedUser.id, message.guild.id);
			if (mentionedAfk) {
				await (message.channel as TextChannel)
					.send(`**${mentionedUser.username}** is AFK${mentionedAfk.reason ? `: ${mentionedAfk.reason}` : ""} — set <t:${Math.floor(mentionedAfk.setAt.getTime() / 1000)}:R>`)
					.catch(() => null);
			}
		}

		// --- Auto-mod ---
		if (settings.autoModEnabled && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
			const now = Date.now();
			const key = `${message.guild.id}:${message.author.id}`;

			// Spam detection
			if (settings.autoModSpamThreshold) {
				// Lazy cleanup: sweep expired entries when the map grows large
				if (spamTracker.size > 5_000) {
					for (const [k, v] of spamTracker) {
						if (now > v.resetAt) spamTracker.delete(k);
					}
				}
				const tracker = spamTracker.get(key);
				if (!tracker || now > tracker.resetAt) {
					spamTracker.set(key, { count: 1, resetAt: now + 5000 });
				} else {
					tracker.count++;
					if (tracker.count >= settings.autoModSpamThreshold) {
						await message.delete().catch(() => null);
						await this.takeAutoModAction(message, settings, "Spam detected");
						spamTracker.delete(key);
					}
				}
			}

			// Bad links
			if (settings.autoModBadLinks && BAD_LINK_PATTERN.test(message.content)) {
				await message.delete().catch(() => null);
				await this.takeAutoModAction(message, settings, "Unauthorized invite/link");
			}

			// Mass mentions
			if (settings.autoModMaxMentions && message.mentions.users.size >= settings.autoModMaxMentions) {
				await message.delete().catch(() => null);
				await this.takeAutoModAction(message, settings, "Mass mentions");
			}
		}

		// --- XP ---
		if (!message.author.bot) {
			const cooldownMs = (settings.xpCooldownSeconds ?? 60) * 1000;
			const xpAmount = Math.floor(Math.random() * 10) + settings.xpRate - 5; // xpRate ± 5

			const { user: currentUser } = await addXp(message.author.id, message.guild.id, 0); // fetch without adding
			const lastMessage = currentUser.lastMessageAt;

			if (!lastMessage || Date.now() - lastMessage.getTime() > cooldownMs) {
				const { leveledUp, newLevel } = await addXp(message.author.id, message.guild.id, Math.max(1, xpAmount));

				if (leveledUp) {
					await this.handleLevelUp(message, newLevel, settings);
				}
			}
		}

		// --- Auto-responder ---
		const match = await findMatchingResponse(message.guild.id, message.content);
		this.container.logger.debug(`[autoresponder] guild=${message.guild.id} content="${message.content.slice(0, 50)}" match=${match ? `trigger="${match.trigger}" type=${match.responseType}` : "none"}`);
		if (match) {
			const cooldownKey = `${message.guild.id}:${match.trigger}`;
			const lastFired = autoResponderCooldown.get(cooldownKey) ?? 0;
			const botMentioned = message.mentions.has(message.client.user);
			const onCooldown = Date.now() - lastFired < AUTO_RESPONDER_COOLDOWN_MS;

			if (onCooldown && !botMentioned) {
				this.container.logger.debug(`[autoresponder] trigger="${match.trigger}" skipped (cooldown)`);
			} else {
				autoResponderCooldown.set(cooldownKey, Date.now());
				if (match.responseType === "llm") {
					const client = this.container.client as BhayanakClient;
					const personalityCtx = await getPersonalityContext(client, message.author.id, message.guild.id);
					const systemWithPersonality = personalityCtx + match.response;
					const reply = await generateAutoResponse(systemWithPersonality, message.content, message.author.username);
					this.container.logger.debug(`[autoresponder] LLM reply=${reply ? `"${reply.slice(0, 50)}"` : "null (skipping)"}`);
					if (reply) await message.reply(reply).catch(() => null);
				} else {
					await message.reply(match.response).catch(() => null);
				}
			}
		}
	}

	private async takeAutoModAction(message: Message, settings: Awaited<ReturnType<typeof getOrCreateSettings>>, reason: string) {
		const action = settings.autoModAction ?? "warn";
		const member = message.member;
		if (!member) return;

		if (action === "mute" && settings.mutedRoleId) {
			const role = message.guild!.roles.cache.get(settings.mutedRoleId);
			if (role) {
				await member.roles.add(role).catch(() => null);
				await createCase({
					guildId: message.guild!.id,
					userId: message.author.id,
					moderatorId: message.client.user!.id,
					type: "mute",
					reason: `[Auto-Mod] ${reason}`,
					duration: settings.autoModMuteDuration,
					expiresAt: settings.autoModMuteDuration ? new Date(Date.now() + settings.autoModMuteDuration) : undefined,
				});
			}
		} else if (action === "kick") {
			await member.kick(`[Auto-Mod] ${reason}`).catch(() => null);
			await createCase({
				guildId: message.guild!.id,
				userId: message.author.id,
				moderatorId: message.client.user!.id,
				type: "kick",
				reason: `[Auto-Mod] ${reason}`,
			});
		} else {
			// warn
			await createCase({
				guildId: message.guild!.id,
				userId: message.author.id,
				moderatorId: message.client.user!.id,
				type: "warn",
				reason: `[Auto-Mod] ${reason}`,
			});
		}

		// Notify user
		await message.author.send(`⚠️ Your message in **${message.guild!.name}** was removed by auto-mod. Reason: ${reason}`).catch(() => null);

		// Log
		if (settings.logChannelId) {
			const logChannel = message.guild!.channels.cache.get(settings.logChannelId) as TextChannel | undefined;
			await logChannel?.send(`🤖 **Auto-Mod** | ${action} applied to <@${message.author.id}>. Reason: ${reason}`).catch(() => null);
		}
	}

	private async handleLevelUp(message: Message, newLevel: number, settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
		const levelUpMsg = (settings.levelUpMessage ?? "🎉 **{user}** leveled up to **Level {level}**!")
			.replace("{user}", `<@${message.author.id}>`)
			.replace("{level}", newLevel.toString())
			.replace("{username}", message.author.username);

		const targetChannel = settings.levelUpChannelId
			? (message.guild!.channels.cache.get(settings.levelUpChannelId) as TextChannel | undefined)
			: (message.channel as TextChannel);

		await targetChannel?.send(levelUpMsg).catch(() => null);

		// Assign level reward roles
		const client = this.container.client as BhayanakClient;
		const { getLevelRewards } = await import("../../db/queries/users.js");
		const rewards = await getLevelRewards(message.guild!.id);
		const reward = rewards.find((r) => r.level === newLevel);
		if (reward) {
			const role = message.guild!.roles.cache.get(reward.roleId);
			if (role) await message.member?.roles.add(role).catch(() => null);
		}
	}
}
