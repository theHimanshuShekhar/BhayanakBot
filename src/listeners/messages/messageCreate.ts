import { Listener } from "@sapphire/framework";
import { type Message, PermissionFlagsBits, type TextChannel } from "discord.js";
import { eq, sql } from "drizzle-orm";
import { clearAfk, getAfk } from "../../db/queries/afk.js";
import { upsertArchivedChannelMessage } from "../../db/queries/archivedChannelMessages.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { createCase } from "../../db/queries/modCases.js";
import { addXp } from "../../db/queries/users.js";
import { archivedChannelMessages, guildPersonalityProfiles, userPersonalityProfiles } from "../../db/schema.js";
import { answerMessage } from "../../lib/ai/replyPipeline.js";
import { notifyOnly } from "../../lib/allowedMentions.js";
import { GUESS_WHO_CHANNEL_ID } from "../../lib/constants.js";
import { db } from "../../lib/database.js";
import { buildGuildPersonalityProfile } from "../../lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../lib/personality/buildProfile.js";
import { trackInlineBuild } from "../../lib/personality/inlineBuilds.js";

// Spam tracking: Map<guildId:userId, { count, resetAt }>
const spamTracker = new Map<string, { count: number; resetAt: number }>();

const PERSONALITY_MAX_USER_MENTIONS = 5;
const USER_MENTION_PATTERN = /<@!?\d+>/g;

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

		// One decision answers the message: an autoresponse, else a Mention Reply, else a Random Reply.
		await this.runStage("reply", () => answerMessage(guildMessage, settings));
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
