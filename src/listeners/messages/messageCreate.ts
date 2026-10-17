import { Listener } from "@sapphire/framework";
import { type Message, PermissionFlagsBits, type TextChannel, userMention } from "discord.js";
import { eq, sql } from "drizzle-orm";
import { clearAfk, getAfk } from "../../db/queries/afk.js";
import { upsertArchivedChannelMessage } from "../../db/queries/archivedChannelMessages.js";
import { findMatchingResponse } from "../../db/queries/autoResponses.js";
import { getGuildPersonalityProfile } from "../../db/queries/guildPersonality.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { createCase } from "../../db/queries/modCases.js";
import { addXp } from "../../db/queries/users.js";
import { archivedChannelMessages, guildPersonalityProfiles, userPersonalityProfiles } from "../../db/schema.js";
import { notifyOnly } from "../../lib/allowedMentions.js";
import {
	addConversationHistoryMessage,
	getConversationContext,
	getConversationContextMessageCount,
	getReplyAnchoredConversationContext,
} from "../../lib/autoresponder/conversationHistory.js";
import { generateAutoResponse, generateMentionReply } from "../../lib/autoresponder/llmResponse.js";
import {
	beginRandomReply,
	claimAiReply,
	markModerated,
	markStaticReply,
	randomReplySkipReason,
} from "../../lib/autoresponder/replyGuard.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";
import { ExpiringBoundedMap } from "../../lib/boundedMap.js";
import { GUESS_WHO_CHANNEL_ID, TARGET_TEXT_CHANNEL_ID } from "../../lib/constants.js";
import { db } from "../../lib/database.js";
import { isHomeServer } from "../../lib/homeServer.js";
import { buildGuildPersonalityProfile } from "../../lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../lib/personality/buildProfile.js";
import { getPersonalityContext } from "../../lib/personality/getPersonalityContext.js";
import { trackInlineBuild } from "../../lib/personality/inlineBuilds.js";

// Spam tracking: Map<guildId:userId, { count, resetAt }>
const spamTracker = new Map<string, { count: number; resetAt: number }>();

// Cooldown maps evict entries once their cooldown has passed, and are capped for a flood of distinct keys.
const COOLDOWN_MAP_MAX_ENTRIES = 5_000;

// Auto-responder cooldown: Map<guildId:trigger, lastFiredAt>
const AUTO_RESPONDER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const autoResponderCooldown = new ExpiringBoundedMap<string, number>(
	COOLDOWN_MAP_MAX_ENTRIES,
	AUTO_RESPONDER_COOLDOWN_MS,
	(firedAt) => new Date(firedAt),
);

// Per-user auto-responder cooldown: Map<guildId:userId, lastFiredAt>
const USER_AUTO_RESPONDER_COOLDOWN_MS = 30 * 1000; // 30 seconds
const userAutoResponderCooldown = new ExpiringBoundedMap<string, number>(
	COOLDOWN_MAP_MAX_ENTRIES,
	USER_AUTO_RESPONDER_COOLDOWN_MS,
	(firedAt) => new Date(firedAt),
);

// Smart mention cooldown: Map<guildId:userId, lastFiredAt>
const SMART_MENTION_COOLDOWN_MS = 10 * 1000; // 10 seconds
const smartMentionCooldown = new ExpiringBoundedMap<string, number>(
	COOLDOWN_MAP_MAX_ENTRIES,
	SMART_MENTION_COOLDOWN_MS,
	(firedAt) => new Date(firedAt),
);

// Auto-responder keys (trigger and user) with an LLM reply being generated. Cooldowns only start once a reply
// is sent, so these keep a burst of messages from starting several LLM calls meanwhile.
const autoResponderInFlight = new Set<string>();

export const messageCreateTestHooks = {
	cooldownSizes: () => ({
		trigger: autoResponderCooldown.size,
		user: userAutoResponderCooldown.size,
		smartMention: smartMentionCooldown.size,
	}),
};

const PERSONALITY_MAX_USER_MENTIONS = 5;
const USER_MENTION_PATTERN = /<@!?\d+>/g;
const MALFORMED_USER_ID_MENTION_PATTERN = /(?<![<\w])@(\d{17,20})(?![>\w])/g;

const BAD_LINK_PATTERN = /https?:\/\/(discord\.gg|discordapp\.com\/invite|bit\.ly|tinyurl\.com)\//i;
const URL_PATTERN = /https?:\/\/\S+/g;

async function recordPersonalityEvidenceIfArchiveLive(input: {
	messageId: string;
	userId: string;
	guildId: string;
}): Promise<{ userCount: number; guildCount: number } | null> {
	return db.transaction(async (tx) => {
		const [archiveRow] = await tx
			.select({ deletedAt: archivedChannelMessages.deletedAt })
			.from(archivedChannelMessages)
			.where(eq(archivedChannelMessages.messageId, input.messageId))
			.for("update");

		if (!archiveRow || archiveRow.deletedAt) return null;

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
		const guildMessage = message as Message<true>;

		const settings = await getOrCreateSettings(message.guild.id);

		// --- Auto-mod first: a removed message gets nothing else (no archive, XP, AFK, reply) ---
		if (await this.runAutoMod(guildMessage, settings)) return;

		// Each remaining stage is isolated: one failing stage never skips the others.
		await this.runStage("archive", () => this.ingestArchive(guildMessage, settings));
		await this.runStage("afk", () => this.handleAfk(guildMessage));
		await this.runStage("xp", () => this.awardXp(guildMessage, settings));

		// Smart mentions and random replies send chat to Zen: Home Server only (ADR 0007).
		const isTargetTextChannel = isHomeServer(message.guild.id) && message.channelId === TARGET_TEXT_CHANNEL_ID;
		await this.runStage("autoresponder", () => this.handleAutoResponder(guildMessage, settings, isTargetTextChannel));

		// --- Random contextual chat responder ---
		if (isTargetTextChannel) {
			await this.runStage("random-reply", () => this.handleRandomResponse(guildMessage, settings));
		}
	}

	/** Runs one stage of message handling, logging (without message content) instead of throwing when it fails. */
	private async runStage(name: string, stage: () => Promise<void>): Promise<void> {
		try {
			await stage();
		} catch (err) {
			this.container.logger.error(`[messageCreate] stage=${name} failed`, err);
		}
	}

	/** Returns true when auto-mod removed the message. The first matching rule wins and creates the only case. */
	private async runAutoMod(
		message: Message<true>,
		settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
	): Promise<boolean> {
		if (!settings.autoModEnabled || message.member?.permissions.has(PermissionFlagsBits.Administrator)) return false;

		const reason = this.findAutoModViolation(message, settings);
		if (!reason) return false;

		markModerated(message.id);
		await this.runStage("auto-mod", async () => {
			await message.delete().catch(() => null);
			await this.takeAutoModAction(message, settings, reason);
		});
		return true;
	}

	private findAutoModViolation(
		message: Message<true>,
		settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
	): string | null {
		const now = Date.now();
		const key = `${message.guild.id}:${message.author.id}`;
		let reason: string | null = null;

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
					spamTracker.delete(key);
					reason = "Spam detected";
				}
			}
		}

		if (!reason && settings.autoModBadLinks && BAD_LINK_PATTERN.test(message.content)) {
			reason = "Unauthorized invite/link";
		}
		if (!reason && settings.autoModMaxMentions && message.mentions.users.size >= settings.autoModMaxMentions) {
			reason = "Mass mentions";
		}
		return reason;
	}

	private async ingestArchive(
		message: Message<true>,
		settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
	): Promise<void> {
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

		// --- Store eligible conversation history for LLM context ---
		addConversationHistoryMessage(message.channel.id, message, this.container.logger);

		// --- Personality features: store message + trigger rebuild when threshold hit ---
		// Filter: skip commands, very short/long messages, URL-only posts, and spam
		const trimmedContent = message.content.trim();
		const contentWithoutUrls = trimmedContent.replace(URL_PATTERN, "");
		const alphaCount = (contentWithoutUrls.match(/[A-Za-z]/g) ?? []).length;
		const userMentionCount = trimmedContent.match(USER_MENTION_PATTERN)?.length ?? 0;
		const personalitySkipReason = !isGuessWhoChannel
			? "not-guess-who-channel"
			: !didInsertArchiveMessage
				? "archive-not-inserted"
				: didArchiveDeletedMessage
					? "archive-marked-deleted"
					: !settings.personalityEnabled
						? "personality-disabled"
						: trimmedContent.length < 15
							? "too-short"
							: trimmedContent.length > 1000
								? "too-long"
								: trimmedContent.startsWith("/") || trimmedContent.startsWith("!")
									? "bot-command-prefix"
									: trimmedContent.includes("@everyone") || trimmedContent.includes("@here")
										? "broadcast-mention"
										: message.mentions.users.size >= PERSONALITY_MAX_USER_MENTIONS ||
												userMentionCount >= PERSONALITY_MAX_USER_MENTIONS
											? "too-many-user-mentions"
											: alphaCount < 5
												? "low-alpha-content"
												: contentWithoutUrls.length < 10
													? "url-only-or-low-signal"
													: null;
		const isMeaningfulForPersonality = personalitySkipReason === null;
		this.container.logger.debug(
			`[personality-ingest] evaluate guild=${message.guild.id} channel=${message.channel.id} message=${message.id} user=${message.author.id} contentLength=${trimmedContent.length} alphaCount=${alphaCount} mentionCount=${message.mentions.users.size} archiveInserted=${didInsertArchiveMessage} archiveDeleted=${didArchiveDeletedMessage} enabled=${settings.personalityEnabled} eligible=${isMeaningfulForPersonality} reason=${personalitySkipReason ?? "eligible"}`,
		);
		if (
			isGuessWhoChannel &&
			didInsertArchiveMessage &&
			!didArchiveDeletedMessage &&
			settings.personalityEnabled &&
			isMeaningfulForPersonality
		) {
			this.container.logger.debug(
				`[personality-ingest] storage start guild=${message.guild.id} channel=${message.channel.id} message=${message.id} user=${message.author.id}`,
			);
			const evidence = await recordPersonalityEvidenceIfArchiveLive({
				messageId: message.id,
				userId: message.author.id,
				guildId: message.guild.id,
			});
			this.container.logger.debug(
				`[personality-ingest] storage result guild=${message.guild.id} channel=${message.channel.id} message=${message.id} user=${message.author.id} stored=${evidence ? "yes" : "no"} userCount=${evidence?.userCount ?? "none"} guildCount=${evidence?.guildCount ?? "none"}`,
			);
			if (evidence?.userCount && evidence.userCount >= 100) {
				// buildPersonalityProfile serialises concurrent calls per user internally.
				const guildId = message.guild.id;
				this.container.logger.debug(
					`[personality-ingest] trigger-user-build userId=${message.author.id} guildId=${guildId} newMessageCount=${evidence.userCount}`,
				);
				void trackInlineBuild(
					buildPersonalityProfile(message.author.id, guildId).catch((err) =>
						this.container.logger.error(
							`[personality] Inline build failed for userId=${message.author.id} guildId=${guildId}:`,
							err,
						),
					),
				);
			}
			// Also increment guild message count for server-wide personality features
			const guildId = message.guild.id;
			if (evidence?.guildCount && evidence.guildCount >= 200) {
				this.container.logger.debug(
					`[personality-ingest] trigger-guild-build guildId=${guildId} messageCount=${evidence.guildCount}`,
				);
				void trackInlineBuild(
					buildGuildPersonalityProfile(guildId).catch((err) =>
						this.container.logger.error(`[guild-personality] Inline build failed for guildId=${guildId}:`, err),
					),
				);
			}
		}
	}

	private async handleAfk(message: Message<true>): Promise<void> {
		// --- AFK clear ---
		await this.runStage("afk-clear", async () => {
			const afk = await getAfk(message.author.id, message.guild.id);
			if (!afk) return;
			await clearAfk(message.author.id, message.guild.id);
			const notice = await message.reply(`Welcome back, <@${message.author.id}>! I removed your AFK status.`);
			setTimeout(() => notice.delete().catch(() => null), 5000);
		});

		// --- Notify AFK users who are mentioned ---
		await this.runStage("afk-notify", async () => {
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
		});
	}

	private async awardXp(
		message: Message<true>,
		settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
	): Promise<void> {
		const cooldownMs = (settings.xpCooldownSeconds ?? 60) * 1000;
		const xpAmount = Math.floor(Math.random() * 10) + settings.xpRate - 5; // xpRate ± 5

		// The cooldown check and the award are one atomic statement, so a burst awards once.
		const { leveledUp, newLevel } = await addXp(message.author.id, message.guild.id, Math.max(1, xpAmount), cooldownMs);
		if (leveledUp) {
			await this.handleLevelUp(message, newLevel, settings);
		}
	}

	private async handleAutoResponder(
		message: Message<true>,
		settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
		isTargetTextChannel: boolean,
	): Promise<void> {
		// --- Auto-responder ---
		const botMentioned = message.mentions.has(message.client.user);
		this.container.logger.debug(
			`[responder] evaluate guild=${message.guild.id} channel=${message.channel.id} message=${message.id} author=${message.author.id} contentLength=${message.content.length} botMentioned=${botMentioned} targetChannel=${isTargetTextChannel}`,
		);
		const match = await findMatchingResponse(message.guild.id, message.content, message.channel.id, botMentioned);
		this.container.logger.debug(
			`[autoresponder] match guild=${message.guild.id} channel=${message.channel.id} message=${message.id} result=${match ? `id=${match.response.id} triggerLength=${match.response.trigger.length} type=${match.response.responseType} deleteTrigger=${match.response.deleteTrigger}` : "none"}`,
		);

		if (match && match.response.responseType === "llm" && !isTargetTextChannel) {
			// An LLM rule's response is the admin's system prompt: outside the target channel skip it entirely,
			// never fall through to posting it as static text.
			this.container.logger.debug(
				`[autoresponder] skip reason=llm-outside-target-channel guild=${message.guild.id} channel=${message.channel.id} message=${message.id} responseId=${match.response.id}`,
			);
		} else if (match) {
			const cooldownKey = `${message.guild.id}:${match.response.trigger}`;
			const lastFired = autoResponderCooldown.get(cooldownKey) ?? 0;
			const userCooldownKey = `${message.guild.id}:${message.author.id}`;
			const lastUserFired = userAutoResponderCooldown.get(userCooldownKey) ?? 0;
			const onCooldown = Date.now() - lastFired < AUTO_RESPONDER_COOLDOWN_MS || autoResponderInFlight.has(cooldownKey);
			const onUserCooldown =
				Date.now() - lastUserFired < USER_AUTO_RESPONDER_COOLDOWN_MS || autoResponderInFlight.has(userCooldownKey);

			if (onCooldown && !botMentioned) {
				this.container.logger.debug(
					`[autoresponder] skip reason=trigger-cooldown guild=${message.guild.id} channel=${message.channel.id} message=${message.id} responseId=${match.response.id} remainingMs=${AUTO_RESPONDER_COOLDOWN_MS - (Date.now() - lastFired)}`,
				);
			} else if (onUserCooldown) {
				this.container.logger.debug(
					`[autoresponder] skip reason=user-cooldown guild=${message.guild.id} channel=${message.channel.id} message=${message.id} responseId=${match.response.id} user=${message.author.id} remainingMs=${USER_AUTO_RESPONDER_COOLDOWN_MS - (Date.now() - lastUserFired)}`,
				);
			} else {
				this.container.logger.debug(
					`[autoresponder] fire guild=${message.guild.id} channel=${message.channel.id} message=${message.id} responseId=${match.response.id} type=${match.response.responseType} botMentioned=${botMentioned}`,
				);
				// Cooldowns start only once a reply is actually sent.
				const startCooldowns = () => {
					autoResponderCooldown.set(cooldownKey, Date.now());
					userAutoResponderCooldown.set(userCooldownKey, Date.now());
				};

				if (match.response.responseType === "llm") {
					autoResponderInFlight.add(cooldownKey);
					autoResponderInFlight.add(userCooldownKey);
					try {
						if (await this.handleLlmAutoResponse(message, match)) startCooldowns();
					} finally {
						autoResponderInFlight.delete(cooldownKey);
						autoResponderInFlight.delete(userCooldownKey);
					}
				} else {
					markStaticReply(message.id);
					this.container.logger.debug(
						`[autoresponder:static] prepare guild=${message.guild.id} channel=${message.channel.id} message=${message.id} responseId=${match.response.id} targetChannel=${isTargetTextChannel}`,
					);
					await this.deleteTrigger(message, match.response);
					const responseText = this.substituteVariables(match.response.response, match.captured);
					if (await this.sendReply(message, responseText, match.response.deleteTrigger)) startCooldowns();
				}
			}
		} else if (isTargetTextChannel && botMentioned && !message.content.match(/^\s*<@!?\d+>\s*$/)) {
			// Smart mention reply when bot is @mentioned but no autoresponder matched
			this.container.logger.debug(
				`[smart-mention] handoff guild=${message.guild.id} channel=${message.channel.id} message=${message.id} reason=no-autoresponder-match`,
			);
			await this.handleSmartMention(message, settings);
		} else if (botMentioned) {
			this.container.logger.debug(
				`[smart-mention] skip guild=${message.guild.id} channel=${message.channel.id} message=${message.id} targetChannel=${isTargetTextChannel} reason=${isTargetTextChannel ? "mention-only" : "non-target-channel"}`,
			);
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

	private async deleteTrigger(message: Message, response: { id: number; deleteTrigger: boolean }) {
		if (!response.deleteTrigger) return;
		this.container.logger.debug(
			`[autoresponder] delete-trigger attempt guild=${message.guild?.id ?? "unknown"} channel=${message.channel.id} message=${message.id} responseId=${response.id}`,
		);
		await message
			.delete()
			.catch((err) => this.container.logger.warn(`[autoresponder] delete-trigger failed message=${message.id}:`, err));
	}

	/**
	 * Generate and send an LLM auto-response. Returns true only when a reply was sent. A failed generation is
	 * invisible: the trigger message is kept and nothing is posted. A delete-trigger rule deletes the trigger
	 * only once there is a reply to send.
	 */
	private async handleLlmAutoResponse(
		message: Message,
		match: NonNullable<Awaited<ReturnType<typeof findMatchingResponse>>>,
	): Promise<boolean> {
		const guildId = message.guild!.id;
		if (!claimAiReply(message.id)) {
			this.container.logger.debug(
				`[autoresponder:llm] skip reason=already-answered guild=${guildId} channel=${message.channel.id} message=${message.id} responseId=${match.response.id}`,
			);
			return false;
		}
		const client = this.container.client as BhayanakClient;
		this.container.logger.debug(
			`[autoresponder:llm] prepare guild=${guildId} channel=${message.channel.id} message=${message.id} responseId=${match.response.id}`,
		);
		const personalityCtx = await getPersonalityContext(client, message.author.id, guildId);
		const systemWithPersonality = personalityCtx + match.response.response;
		const conversationContext = getConversationContext(message.channel.id, 20, message.id);
		this.container.logger.debug(
			`[autoresponder:llm] context guild=${guildId} channel=${message.channel.id} message=${message.id} responseId=${match.response.id} contextMessages=${getConversationContextMessageCount(conversationContext)} contextLength=${conversationContext.length} personalityLength=${personalityCtx.length} systemLength=${systemWithPersonality.length}`,
		);
		const reply = await generateAutoResponse(
			systemWithPersonality,
			message.content,
			`<@${message.author.id}>`,
			`autoresponse:${message.channel.id}`,
			conversationContext,
		);
		this.container.logger.debug(
			`[autoresponder:llm] result guild=${guildId} channel=${message.channel.id} message=${message.id} responseId=${match.response.id} reply=${reply ? `present length=${reply.length}` : "null"}`,
		);
		if (!reply) return false;

		const safeReply = this.normalizeKnownUserNames(message, this.substituteVariables(reply, match.captured));
		await this.deleteTrigger(message, match.response);
		return this.sendReply(message, safeReply, match.response.deleteTrigger);
	}

	/** Returns true when the reply was sent. */
	private async sendReply(message: Message, content: string, deletedTrigger: boolean): Promise<boolean> {
		const safeReply = content.length > 1990 ? `${content.slice(0, 1989)}…` : content;
		if (safeReply.length !== content.length) {
			this.container.logger.warn(`[autoresponder] Reply truncated from ${content.length} to ${safeReply.length} chars`);
		}
		const mode = deletedTrigger ? "channel-send" : "message-reply";
		this.container.logger.debug(
			`[autoresponder] send attempt mode=${mode} guild=${message.guild?.id ?? "unknown"} channel=${message.channel.id} sourceMessage=${message.id} length=${safeReply.length}`,
		);
		try {
			// If trigger was deleted, send as regular message instead of reply
			if (deletedTrigger) await (message.channel as TextChannel).send(safeReply);
			else await message.reply(safeReply);
		} catch (err) {
			this.container.logger.warn(`[autoresponder] send failed mode=${mode} message=${message.id}:`, err);
			return false;
		}
		this.container.logger.debug(
			`[autoresponder] send success mode=${mode} guild=${message.guild?.id ?? "unknown"} channel=${message.channel.id} sourceMessage=${message.id}`,
		);
		return true;
	}

	private async handleSmartMention(message: Message, settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
		this.container.logger.debug(
			`[smart-mention] evaluate guild=${message.guild?.id ?? "unknown"} channel=${message.channel.id} message=${message.id} personalityEnabled=${settings.personalityEnabled} reference=${message.reference?.messageId ?? "none"}`,
		);
		// Skip if personality features are disabled or not in a guild
		if (!settings.personalityEnabled || !message.guild) {
			this.container.logger.debug(
				`[smart-mention] skip guild=${message.guild?.id ?? "unknown"} channel=${message.channel.id} message=${message.id} reason=${message.guild ? "personality-disabled" : "missing-guild"}`,
			);
			return;
		}

		const guildId = message.guild.id;
		// Per-user cooldown to prevent LLM spam
		const cooldownKey = `${guildId}:${message.author.id}`;
		const lastFired = smartMentionCooldown.get(cooldownKey) ?? 0;
		if (Date.now() - lastFired < SMART_MENTION_COOLDOWN_MS) {
			this.container.logger.debug(`[smart-mention] cooldown active for ${cooldownKey}`);
			return;
		}
		// Random AI replies skip a message that already has a direct reply.
		if (!claimAiReply(message.id)) return;
		smartMentionCooldown.set(cooldownKey, Date.now());

		const client = this.container.client as BhayanakClient;
		this.container.logger.debug(
			`[smart-mention] prepare guild=${guildId} channel=${message.channel.id} message=${message.id} user=${message.author.id}`,
		);
		const personalityCtx = await getPersonalityContext(client, message.author.id, guildId);
		const replyAnchoredContext = getReplyAnchoredConversationContext(
			message.channel.id,
			message.reference?.messageId,
			10,
		);
		const conversationContext = replyAnchoredContext ?? getConversationContext(message.channel.id, 15, message.id);
		this.container.logger.debug(
			`[smart-mention] context guild=${guildId} channel=${message.channel.id} message=${message.id} mode=${replyAnchoredContext ? "reply-anchored" : "recent"} reference=${message.reference?.messageId ?? "none"} contextMessages=${getConversationContextMessageCount(conversationContext)} contextLength=${conversationContext.length} personalityLength=${personalityCtx.length}`,
		);

		const systemPrompt = [
			`You are a Discord bot named ${message.client.user.username}.`,
			`You are chatting in the server "${message.guild!.name}".`,
			`Be witty and funny. Use jokes or playful roasts, but avoid genuine hostility or harassment.`,
			personalityCtx,
		].join("\n");

		this.container.logger.debug(
			`[smart-mention] llm-call guild=${guildId} channel=${message.channel.id} message=${message.id}`,
		);
		const reply = await generateMentionReply(
			systemPrompt,
			conversationContext,
			`<@${message.author.id}>`,
			message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "").trim(),
			`mention:${message.channel.id}`,
		);

		this.container.logger.debug(
			`[smart-mention] llm-result guild=${guildId} channel=${message.channel.id} message=${message.id} reply=${reply ? `present length=${reply.length}` : "null"}`,
		);
		if (reply) {
			const normalizedReply = this.normalizeKnownUserNames(message, reply);
			const safeReply = normalizedReply.length > 1990 ? `${normalizedReply.slice(0, 1989)}…` : normalizedReply;
			this.container.logger.debug(
				`[smart-mention] send attempt guild=${guildId} channel=${message.channel.id} message=${message.id} length=${safeReply.length}`,
			);
			await message
				.reply(safeReply)
				.then(() =>
					this.container.logger.debug(
						`[smart-mention] send success guild=${guildId} channel=${message.channel.id} message=${message.id}`,
					),
				)
				.catch((err) => this.container.logger.warn(`[smart-mention] reply send failed message=${message.id}:`, err));
		}
	}

	private async handleRandomResponse(message: Message, settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
		this.container.logger.debug(
			`[random-response] evaluate guild=${message.guild?.id ?? "unknown"} channel=${message.channel.id} message=${message.id} configuredChannel=${settings.randomResponseChannelId ?? "none"} chance=${settings.randomResponseChance}`,
		);
		// Must have a configured channel and non-zero chance, and be in that channel
		const skipReason = randomReplySkipReason(settings, message.channel.id);
		if (skipReason) {
			this.container.logger.debug(
				`[random-response] skip guild=${message.guild?.id ?? "unknown"} channel=${message.channel.id} message=${message.id} reason=${skipReason} configuredChannel=${settings.randomResponseChannelId ?? "none"}`,
			);
			return;
		}

		// Roll against the configured chance
		const roll = Math.random() * 100;
		if (roll > settings.randomResponseChance) {
			this.container.logger.debug(
				`[random-response] skip guild=${message.guild?.id ?? "unknown"} channel=${message.channel.id} message=${message.id} reason=chance roll=${roll.toFixed(2)} chance=${settings.randomResponseChance}`,
			);
			return;
		}

		// One reply per message and a per-channel cooldown shared with the randomResponder listener
		const guildId = message.guild!.id;
		const ticket = beginRandomReply(message.id, message.channel.id);
		if (!ticket) {
			this.container.logger.debug(
				`[random-response] skip guild=${guildId} channel=${message.channel.id} message=${message.id} reason=cooldown-or-answered`,
			);
			return;
		}
		this.container.logger.debug(
			`[random-response] fire guild=${guildId} channel=${message.channel.id} message=${message.id} roll=${roll.toFixed(2)} chance=${settings.randomResponseChance}`,
		);

		let sent = false;
		try {
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

			const conversationContext = getConversationContext(message.channel.id, 10, message.id);

			this.container.logger.debug(
				`[random-response] context guild=${guildId} channel=${message.channel.id} message=${message.id} contextMessages=${getConversationContextMessageCount(conversationContext)} contextLength=${conversationContext.length} guildProfile=${guildProfile ? "present" : "missing"} guildContextLength=${guildContext.length}`,
			);
			this.container.logger.debug(
				`[random-response] llm-call guild=${guildId} channel=${message.channel.id} message=${message.id}`,
			);

			const reply = await generateMentionReply(
				systemPrompt,
				conversationContext,
				`<@${message.author.id}>`,
				message.content,
				`random:${message.channel.id}`,
			);

			this.container.logger.debug(
				`[random-response] llm-result guild=${guildId} channel=${message.channel.id} message=${message.id} reply=${reply ? `present length=${reply.length}` : "null"}`,
			);
			if (!reply) return;
			if (!ticket.stillOwned()) {
				this.container.logger.debug(
					`[random-response] drop guild=${guildId} channel=${message.channel.id} message=${message.id} reason=answered-directly`,
				);
				return;
			}

			const normalizedReply = this.normalizeKnownUserNames(message, reply);
			const safeReply = normalizedReply.length > 1990 ? `${normalizedReply.slice(0, 1989)}…` : normalizedReply;
			this.container.logger.debug(
				`[random-response] send attempt guild=${guildId} channel=${message.channel.id} message=${message.id} length=${safeReply.length}`,
			);
			try {
				await (message.channel as TextChannel).send(safeReply);
				sent = true;
				this.container.logger.debug(
					`[random-response] send success guild=${guildId} channel=${message.channel.id} message=${message.id}`,
				);
			} catch (err) {
				this.container.logger.warn(`[random-response] send failed message=${message.id}:`, err);
			}
		} finally {
			ticket.finish(sent);
		}
	}

	private normalizeKnownUserNames(message: Message, content: string): string {
		const members = message.guild?.members.cache;
		if (!members) return content;

		const replacements = new Map<string, string>();
		const knownUserIds = new Set<string>([message.author.id]);
		for (const member of members.values()) {
			knownUserIds.add(member.id);
			const user = member.user;
			for (const name of [member.displayName, user.username, user.globalName]) {
				if (!name || name.length < 3) continue;
				replacements.set(name, userMention(member.id));
			}
		}

		let normalized = content;
		normalized = normalized.replace(MALFORMED_USER_ID_MENTION_PATTERN, (match, userId: string) =>
			knownUserIds.has(userId) ? userMention(userId) : match,
		);
		for (const [name, mention] of [...replacements.entries()].sort((a, b) => b[0].length - a[0].length)) {
			const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			normalized = normalized.replace(new RegExp(`(?<![\\w@])${escapedName}(?![\\w])`, "g"), mention);
		}

		return normalized;
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

		await targetChannel
			?.send({ content: levelUpMsg, allowedMentions: notifyOnly([message.author.id]) })
			.catch(() => null);

		// Assign level reward roles
		const { getLevelRewards } = await import("../../db/queries/users.js");
		const rewards = await getLevelRewards(message.guild!.id);
		const reward = rewards.find((r) => r.level === newLevel);
		if (reward) {
			const role = message.guild!.roles.cache.get(reward.roleId);
			if (role) await message.member?.roles.add(role).catch(() => null);
		}
	}
}
