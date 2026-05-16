import { Listener } from "@sapphire/framework";
import {
	AuditLogEvent,
	EmbedBuilder,
	Guild,
	GuildAuditLogEntryCreatePayload,
	TextChannel,
} from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { createCase, findRecentCase } from "../../db/queries/modCases.js";
import type { ModCase } from "../../db/queries/modCases.js";

const ACTION_COLOR: Record<string, number> = {
	ban: 0xed4245,
	unban: 0x57f287,
	kick: 0xfee75c,
	mute: 0xe67e22,
	unmute: 0x3498db,
	warn: 0x95a5a6,
};

const ACTION_LABEL: Record<string, string> = {
	ban: "🔨 Ban",
	unban: "🔓 Unban",
	kick: "👢 Kick",
	mute: "🔇 Mute",
	unmute: "🔊 Unmute",
	warn: "⚠️ Warn",
};

export class GuildAuditLogEntryCreateListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "guildAuditLogEntryCreate" });
	}

	public async run(entry: GuildAuditLogEntryCreatePayload, guild: Guild) {
		const settings = await getOrCreateSettings(guild.id);
		if (!settings.logChannelId) return;

		const logChannel = guild.channels.cache.get(settings.logChannelId) as TextChannel | undefined;
		if (!logChannel) return;

		const { embed, caseType, targetId, durationMs } = this.formatEntry(entry, settings.mutedRoleId);
		if (!embed) return;

		try {
			await logChannel.send({ embeds: [embed] });
		} catch (err) {
			this.container.logger.warn(`[ModLog] Failed to send log to ${settings.logChannelId}:`, err);
		}

		// Create mod case for moderation actions (with deduplication)
		if (caseType && targetId) {
			const since = new Date(Date.now() - 10_000);
			const existing = await findRecentCase(guild.id, targetId, caseType as ModCase["type"], since);
			if (!existing) {
				try {
					await createCase({
						guildId: guild.id,
						userId: targetId,
						moderatorId: entry.executorId ?? guild.client.user!.id,
						type: caseType as ModCase["type"],
						reason: entry.reason ?? undefined,
						duration: durationMs ?? undefined,
						expiresAt: durationMs ? new Date(Date.now() + durationMs) : undefined,
					});
				} catch (err) {
					this.container.logger.error(`[ModLog] Failed to create case for ${caseType}:`, err);
				}
			}
		}
	}

	private formatEntry(
		entry: GuildAuditLogEntryCreatePayload,
		mutedRoleId: string | null,
	): { embed: EmbedBuilder | null; caseType: string | null; targetId: string | null; durationMs?: number } {
		switch (entry.action) {
			case AuditLogEvent.MemberBanAdd: {
				const target = entry.target as { id: string } | null;
				return {
					embed: this.buildEmbed("ban", entry, target?.id),
					caseType: "ban",
					targetId: target?.id ?? null,
				};
			}
			case AuditLogEvent.MemberBanRemove: {
				const target = entry.target as { id: string } | null;
				return {
					embed: this.buildEmbed("unban", entry, target?.id),
					caseType: "unban",
					targetId: target?.id ?? null,
				};
			}
			case AuditLogEvent.MemberKick: {
				const target = entry.target as { id: string } | null;
				return {
					embed: this.buildEmbed("kick", entry, target?.id),
					caseType: "kick",
					targetId: target?.id ?? null,
				};
			}
			case AuditLogEvent.MemberUpdate: {
				const target = entry.target as { id: string } | null;
				const changes = entry.changes as Array<{ key: string; new?: unknown; old?: unknown }>;
				const timeoutChange = changes.find((c) => c.key === "communication_disabled_until");
				if (timeoutChange) {
					const newValue = timeoutChange.new as string | null;
					const oldValue = timeoutChange.old as string | null;
					if (newValue && !oldValue) {
						// Timeout applied
						const until = new Date(newValue);
						const durationMs = until.getTime() - Date.now();
						return {
							embed: this.buildEmbed("mute", entry, target?.id, `Duration: ${this.formatDuration(durationMs)}`),
							caseType: "mute",
							targetId: target?.id ?? null,
							durationMs: Math.max(0, durationMs),
						};
					}
					if (!newValue && oldValue) {
						// Timeout removed
						return {
							embed: this.buildEmbed("unmute", entry, target?.id, "Timeout removed"),
							caseType: "unmute",
							targetId: target?.id ?? null,
						};
					}
				}
				return { embed: null, caseType: null, targetId: null };
			}
			case AuditLogEvent.MemberRoleUpdate: {
				const target = entry.target as { id: string } | null;
				const changes = entry.changes as Array<{
					key: string;
					new?: Array<{ id: string }>;
					old?: Array<{ id: string }>;
				}>;
				const roleChange = changes.find((c) => c.key === "$add" || c.key === "$remove");
				if (!roleChange || !mutedRoleId) return { embed: null, caseType: null, targetId: null };

				const isAdd = roleChange.key === "$add";
				const roles = isAdd ? roleChange.new : roleChange.old;
				const hasMutedRole = roles?.some((r) => r.id === mutedRoleId);
				if (!hasMutedRole) return { embed: null, caseType: null, targetId: null };

				const type = isAdd ? "mute" : "unmute";
				return {
					embed: this.buildEmbed(type, entry, target?.id, isAdd ? "Muted role applied" : "Muted role removed"),
					caseType: type,
					targetId: target?.id ?? null,
				};
			}
			default:
				return { embed: null, caseType: null, targetId: null };
		}
	}

	private buildEmbed(
		action: string,
		entry: GuildAuditLogEntryCreatePayload,
		targetId?: string,
		extra?: string,
	): EmbedBuilder {
		const executor = entry.executorId ? `<@${entry.executorId}>` : "System";
		const target = targetId ? `<@${targetId}>` : "Unknown";
		const reason = entry.reason ? entry.reason.slice(0, 1024) : "No reason provided";

		const embed = new EmbedBuilder()
			.setColor(ACTION_COLOR[action] ?? 0x95a5a6)
			.setTitle(ACTION_LABEL[action] ?? action)
			.addFields(
				{ name: "User", value: target, inline: true },
				{ name: "Moderator", value: executor, inline: true },
				{ name: "Reason", value: reason },
			)
			.setTimestamp(entry.createdAt)
			.setFooter({ text: `Case ID: ${entry.id}` });

		if (extra) {
			embed.addFields({ name: "Details", value: extra });
		}

		return embed;
	}

	private formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}
}
