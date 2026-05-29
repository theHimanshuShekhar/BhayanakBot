import { Listener } from "@sapphire/framework";
import { EmbedBuilder, type Message, PermissionFlagsBits, type TextChannel } from "discord.js";
import { eq, sql } from "drizzle-orm";
import { clearAfk, getAfk } from "../../db/queries/afk.js";
import { upsertArchivedChannelMessage } from "../../db/queries/archivedChannelMessages.js";
import { findMatchingResponse } from "../../db/queries/autoResponses.js";
import { getGuildPersonalityProfile } from "../../db/queries/guildPersonality.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { createCase } from "../../db/queries/modCases.js";
import { addXp } from "../../db/queries/users.js";
import { archivedChannelMessages, guildPersonalityProfiles, userMessages, userPersonalityProfiles } from "../../db/schema.js";
import { db } from "../../lib/database.js";
import { generateAutoResponse, generateMentionReply } from "../../lib/autoresponder/llmResponse.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";
import { GUESS_WHO_CHANNEL_ID, TARGET_TEXT_CHANNEL_ID } from "../../lib/constants.js";
import { buildGuildPersonalityProfile } from "../../lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../lib/personality/buildProfile.js";
import { getPersonalityContext } from "../../lib/personality/getPersonalityContext.js";

// Spam tracking: Map<guildId:userId, { count, resetAt }>
const spamTracker = new Map<string, { count: number; resetAt: number }>();

// Auto-responder cooldown: Map<guildId:trigger, lastFiredAt>
const autoResponderCooldown = new Map<string, number>();
const AUTO_RESPONDER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// Per-user auto-responder cooldown: Map<guildId:userId, lastFiredAt>
const userAutoResponderCooldown = new Map<string, number>();
const USER_AUTO_RESPONDER_COOLDOWN_MS = 30 * 1000; // 30 seconds

// Smart mention cooldown: Map<guildId:userId, lastFiredAt>
const smartMentionCooldown = new Map<string, number>();
const SMART_MENTION_COOLDOWN_MS = 10 * 1000; // 10 seconds

// Random chat responder cooldown: Map<guildId, lastFiredAt>
const randomResponseCooldown = new Map<string, number>();
const RANDOM_RESPONSE_COOLDOWN_MS = 45 * 1000; // 45 seconds
const PERSONALITY_MAX_USER_MENTIONS = 5;
const USER_MENTION_PATTERN = /<@!?\d+>/g;

// Conversation history for LLM context: Map<channelId, messages[]>
const CONVERSATION_HISTORY_LIMIT = 20;
const conversationHistory = new Map<string, { author: string; content: string; timestamp: number }[]>();

const BAD_LINK_PATTERN = /https?:\/\/(discord\.gg|discordapp\.com\/invite|bit\.ly|tinyurl\.com)\//i;
const URL_PATTERN = /https?:\/\/\S+/g;
const HAS_ALPHA_PATTERN = /[A-Za-z]/;

async function recordPersonalityEvidenceIfArchiveLive(input: {
	messageId: string;
	userId: string;
	guildId: string;
	content: string;
}): Promise<{ userCount: number; guildCount: number } | null> {
	return db.transaction(async (tx) => {
		const [archiveRow] = await tx
			.select({ deletedAt: archivedChannelMessages.deletedAt })
			.from(archivedChannelMessages)
			.where(eq(archivedChannelMessages.messageId, input.messageId))
			.for("update");

		if (!archiveRow || archiveRow.deletedAt) return null;

		await tx.insert(userMessages).values({ userId: input.userId, guildId: input.guildId, content: input.content });
		const [userProfile] = await tx
			.insert(userPersonalityProfiles)
			.values({ userId: input.userId, guildId: input.guildId, newMessageCount: 1 })
			.onConflictDoUpdate({
				target: [userPersonalityProfiles.userId, userPersonalityProfiles.guildId],
				set: { newMessageCount: sql`${userPersonalityProfiles.newMessageCount} + 1` },
			})
			.returning({ newMessageCount: userPersonalityProfiles.newMessageCount });

		const [guildProfile] = await tx
			.insert(guildPersonalityProfiles)
			.values({ guildId: input.guildId, messageCount: 1 })
			.onConflictDoUpdate({
				target: guildPersonalityProfiles.guildId,
				set: { messageCount: sql`${guildPersonalityProfiles.messageCount} + 1` },
			})
			.returning({ messageCount: guildPersonalityProfiles.messageCount });

		if (!userProfile || !guildProfile) {
			throw new Error(`recordPersonalityEvidence: empty returning for ${input.userId}/${input.guildId}`);
		}

		return { userCount: userProfile.newMessageCount, guildCount: guildProfile.messageCount };
	});
}

export class MessageCreateListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "messageCreate" });
	}

	public async run(message: Message) {
		if (message.author.bot || !message.guild) return;

		const isGuessWhoChannel = message.channelId === GUESS_WHO_CHANNEL_ID;
		let didInsertArchiveMessage = false;
		let didArchiveDeletedMessage = false;
		if (isGuessWhoChannel) {
			const archiveResult = await upsertArchivedChannelMessage({
				messageId: message.id,
				guildId: message.guild.id,
				channelId: message.channelId,
				authorUserId: message.author.id,
				authorUsername: message.author.username,
				authorDisplayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
				content: message.content,
				messageCreatedAt: message.createdAt,
			}).catch((err) => {
				this.container.logger.error("[guess-who] Failed to archive message:", err);
				return null;
			});
			didInsertArchiveMessage = archiveResult?.inserted ?? false;
			didArchiveDeletedMessage = archiveResult?.deleted ?? false;
		}

		const settings = await getOrCreateSettings(message.guild.id);
		const isTargetTextChannel = message.channelId === TARGET_TEXT_CHANNEL_ID;

		// --- Store conversation history ---
		this.addToConversationHistory(message);

		// --- Personality profiling: store message + trigger rebuild when threshold hit ---
		// Filter: skip commands, very short/long messages, URL-only posts, and spam
		const trimmedContent = message.content.trim();
		const contentWithoutUrls = trimmedContent.replace(URL_PATTERN, "");
		const alphaCount = (contentWithoutUrls.match(/[A-Za-z]/g) ?? []).length;
		const userMentionCount = trimmedContent.match(USER_MENTION_PATTERN)?.length ?? 0;
		const isMeaningfulForPersonality =
			trimmedContent.length >= 15 &&
			trimmedContent.length <= 1000 &&
			!trimmedContent.startsWith("/") &&
			!trimmedContent.startsWith("!") &&
			!trimmedContent.includes("@everyone") &&
			!trimmedContent.includes("@here") &&
			message.mentions.users.size < PERSONALITY_MAX_USER_MENTIONS &&
			userMentionCount < PERSONALITY_MAX_USER_MENTIONS &&
			alphaCount >= 5 &&
			contentWithoutUrls.length >= 10;
		if (
			isGuessWhoChannel &&
			didInsertArchiveMessage &&
			!didArchiveDeletedMessage &&
			settings.personalityEnabled &&
			isMeaningfulForPersonality
		) {
			const evidence = await recordPersonalityEvidenceIfArchiveLive({
				messageId: message.id,
				userId: message.author.id,
				guildId: message.guild.id,
				content: trimmedContent,
			});
			if (evidence?.userCount && evidence.userCount >= 100) {
				// buildPersonalityProfile serialises concurrent calls per user internally.
				const guildId = message.guild.id;
				void buildPersonalityProfile(message.author.id, guildId).catch((err) =>
					this.container.logger.error(
						`[personality] Inline build failed for userId=${message.author.id} guildId=${guildId}:`,
						err,
					),
				);
			}
			// Also increment guild message count for server-wide personality profiling
			const guildId = message.guild.id;
			if (evidence?.guildCount && evidence.guildCount >= 200) {
				void buildGuildPersonalityProfile(guildId).catch((err) =>
					this.container.logger.error(`[guild-personality] Inline build failed for guildId=${guildId}:`, err),
				);
			}
		}

		// --- AFK clear ---
		const afk = await getAfk(message.author.id, message.guild.id);
		if (afk) {
			await clearAfk(message.author.id, message.guild.id);
			await message
				.reply(`Welcome back, <@${message.author.id}>! I removed your AFK status.`)
				.then((m) => setTimeout(() => m.delete().catch(() => null), 5000));
		}

		// --- Notify AFK users who are mentioned ---
		for (const [, mentionedUser] of message.mentions.users) {
			const mentionedAfk = await getAfk(mentionedUser.id, message.guild.id);
			if (mentionedAfk) {
				await (message.channel as TextChannel)
					.send(
						`**${mentionedUser.username}** is AFK${mentionedAfk.reason ? `: ${mentionedAfk.reason}` : ""} — set <t:${Math.floor(mentionedAfk.setAt.getTime() / 1000)}:R>`,
					)
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
		const botMentioned = message.mentions.has(message.client.user);
		const match = await findMatchingResponse(message.guild.id, message.content, message.channel.id, botMentioned);
		this.container.logger.debug(
			`[autoresponder] guild=${message.guild.id} content="${message.content.slice(0, 50)}" match=${match ? `trigger="${match.response.trigger}" type=${match.response.responseType}` : "none"}`,
		);

		if (match) {
			const cooldownKey = `${message.guild.id}:${match.response.trigger}`;
			const lastFired = autoResponderCooldown.get(cooldownKey) ?? 0;
			const userCooldownKey = `${message.guild.id}:${message.author.id}`;
			const lastUserFired = userAutoResponderCooldown.get(userCooldownKey) ?? 0;
			const onCooldown = Date.now() - lastFired < AUTO_RESPONDER_COOLDOWN_MS;
			const onUserCooldown = Date.now() - lastUserFired < USER_AUTO_RESPONDER_COOLDOWN_MS;

			if (onCooldown && !botMentioned) {
				this.container.logger.debug(`[autoresponder] trigger="${match.response.trigger}" skipped (cooldown)`);
			} else if (onUserCooldown) {
				this.container.logger.debug(`[autoresponder] trigger="${match.response.trigger}" skipped (user cooldown)`);
			} else {
				autoResponderCooldown.set(cooldownKey, Date.now());
				userAutoResponderCooldown.set(userCooldownKey, Date.now());

				// Delete trigger if configured
				if (match.response.deleteTrigger) {
					await message.delete().catch(() => null);
				}

				if (isTargetTextChannel && match.response.responseType === "llm") {
					const client = this.container.client as BhayanakClient;
					const personalityCtx = await getPersonalityContext(client, message.author.id, message.guild.id);
					const systemWithPersonality = personalityCtx + match.response.response;
					const conversationContext = this.getConversationContext(message.channel.id, 10);
					const reply = await generateAutoResponse(
						systemWithPersonality,
						message.content,
						message.author.username,
						conversationContext,
					);
					this.container.logger.debug(
						`[autoresponder] LLM reply=${reply ? `"${reply.slice(0, 50)}"` : "null (skipping)"}`,
					);
					if (reply) {
						const safeReply = this.substituteVariables(reply, match.captured);
						await this.sendReply(message, safeReply, match.response.deleteTrigger);
					}
				} else {
					const responseText = this.substituteVariables(match.response.response, match.captured);
					await this.sendReply(message, responseText, match.response.deleteTrigger);
				}
			}
		} else if (isTargetTextChannel && botMentioned && !message.content.match(/^\s*<@!?\d+>\s*$/)) {
			// Smart mention reply when bot is @mentioned but no autoresponder matched
			await this.handleSmartMention(message, settings);
		}

		// --- Random contextual chat responder ---
		if (isTargetTextChannel) {
			await this.handleRandomResponse(message, settings);
		}
	}

	private substituteVariables(response: string, captured?: Record<string, string>): string {
		if (!captured) return response;
		let result = response;
		for (const [key, value] of Object.entries(captured)) {
			result = result.replaceAll(`{${key}}`, value);
		}
		return result;
	}

	private async sendReply(message: Message, content: string, deletedTrigger: boolean) {
		const safeReply = content.length > 1990 ? `${content.slice(0, 1989)}…` : content;
		if (safeReply.length !== content.length) {
			this.container.logger.warn(`[autoresponder] Reply truncated from ${content.length} to ${safeReply.length} chars`);
		}
		// If trigger was deleted, send as regular message instead of reply
		if (deletedTrigger) {
			await (message.channel as TextChannel)
				.send(safeReply)
				.catch((err) => this.container.logger.warn(`[autoresponder] send failed:`, err));
		} else {
			await message
				.reply(safeReply)
				.catch((err) => this.container.logger.warn(`[autoresponder] reply send failed:`, err));
		}
	}

	private async handleSmartMention(message: Message, settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
		// Skip if personality profiling is disabled or not in a guild
		if (!settings.personalityEnabled || !message.guild) return;

		// Per-user cooldown to prevent Ollama spam
		const cooldownKey = `${message.guild.id}:${message.author.id}`;
		const lastFired = smartMentionCooldown.get(cooldownKey) ?? 0;
		if (Date.now() - lastFired < SMART_MENTION_COOLDOWN_MS) {
			this.container.logger.debug(`[smart-mention] cooldown active for ${cooldownKey}`);
			return;
		}
		smartMentionCooldown.set(cooldownKey, Date.now());

		const client = this.container.client as BhayanakClient;
		const personalityCtx = await getPersonalityContext(client, message.author.id, message.guild.id);
		const conversationContext = this.getConversationContext(message.channel.id, 15);

		const systemPrompt = [
			`You are a Discord bot named ${message.client.user.username}.`,
			`You are chatting in the server "${message.guild!.name}".`,
			`You are savage, unhinged, and brutally funny. You roast users. You mock their bad takes. You never apologise.`,
			personalityCtx,
		].join("\n");

		const reply = await generateMentionReply(
			systemPrompt,
			conversationContext,
			message.author.username,
			message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "").trim(),
		);

		if (reply) {
			const safeReply = reply.length > 1990 ? `${reply.slice(0, 1989)}…` : reply;
			await message
				.reply(safeReply)
				.catch((err) => this.container.logger.warn(`[smart-mention] reply send failed:`, err));
		}
	}

	private async handleRandomResponse(message: Message, settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
		// Must have a configured channel and non-zero chance
		if (!settings.randomResponseChannelId || settings.randomResponseChance <= 0) return;
		if (message.channel.id !== settings.randomResponseChannelId) return;

		// Roll against the configured chance
		const roll = Math.random() * 100;
		if (roll > settings.randomResponseChance) {
			this.container.logger.debug(
				`[random-response] roll=${roll.toFixed(2)}% > chance=${settings.randomResponseChance}% (skipped)`,
			);
			return;
		}

		// Guild cooldown to prevent streaks
		const guildId = message.guild!.id;
		const lastFired = randomResponseCooldown.get(guildId) ?? 0;
		if (Date.now() - lastFired < RANDOM_RESPONSE_COOLDOWN_MS) {
			this.container.logger.debug(`[random-response] cooldown active for guild=${guildId}`);
			return;
		}
		randomResponseCooldown.set(guildId, Date.now());

		const guildProfile = await getGuildPersonalityProfile(guildId);
		const guildContext = guildProfile ? `\n\nThis server's culture: ${guildProfile}` : "";

		const systemPrompt = [
			`You are a Discord bot named ${message.client.user.username}.`,
			`You are chatting in the server "${message.guild!.name}".`,
			`Be helpful, witty, and conversational.`,
			`Respond naturally to the ongoing conversation — don't ask questions unless it makes sense.`,
			`Keep your response short (1-2 sentences max).`,
			guildContext,
		].join("\n");

		const conversationContext = this.getConversationContext(message.channel.id, 10);

		this.container.logger.debug(`[random-response] triggered roll=${roll.toFixed(2)}% channel=${message.channel.id}`);

		const reply = await generateMentionReply(
			systemPrompt,
			conversationContext,
			message.author.username,
			message.content,
		);

		if (reply) {
			const safeReply = reply.length > 1990 ? `${reply.slice(0, 1989)}…` : reply;
			await (message.channel as TextChannel)
				.send(safeReply)
				.catch((err) => this.container.logger.warn(`[random-response] send failed:`, err));
		}
	}

	private addToConversationHistory(message: Message) {
		const channelId = message.channel.id;
		let history = conversationHistory.get(channelId);
		if (!history) {
			history = [];
			conversationHistory.set(channelId, history);
		}
		history.push({
			author: message.author.username,
			content: message.content.slice(0, 500), // cap individual message length
			timestamp: Date.now(),
		});
		// Trim old messages
		if (history.length > CONVERSATION_HISTORY_LIMIT) {
			history.shift();
		}
		// Also remove messages older than 30 minutes
		const cutoff = Date.now() - 30 * 60 * 1000;
		while (history.length > 0 && history[0].timestamp < cutoff) {
			history.shift();
		}
		// Clean up empty entries to prevent unbounded Map growth
		if (history.length === 0) {
			conversationHistory.delete(channelId);
		}
	}

	private getConversationContext(channelId: string, limit: number): string {
		const history = conversationHistory.get(channelId);
		if (!history || history.length === 0) return "";
		return history
			.slice(-limit)
			.map((m) => `${m.author}: ${m.content}`)
			.join("\n");
	}

	private async takeAutoModAction(
		message: Message,
		settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
		reason: string,
	) {
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
		await message.author
			.send(`⚠️ Your message in **${message.guild!.name}** was removed by auto-mod. Reason: ${reason}`)
			.catch(() => null);

		// Log
		if (settings.logChannelId) {
			const logChannel = message.guild!.channels.cache.get(settings.logChannelId) as TextChannel | undefined;
			await logChannel
				?.send(`🤖 **Auto-Mod** | ${action} applied to <@${message.author.id}>. Reason: ${reason}`)
				.catch(() => null);
		}
	}

	private async handleLevelUp(
		message: Message,
		newLevel: number,
		settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
	) {
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
