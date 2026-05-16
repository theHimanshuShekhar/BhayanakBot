# Mod Log Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `guildAuditLogEntryCreate` listener that posts moderation action embeds to a configured log channel and creates `modCases` rows for manual Discord actions, with deduplication against bot-command cases.

**Architecture:** Event-driven via Discord.js `GuildModeration` intent. One new listener handles all audit log events, filters for moderation actions, formats embeds, and optionally creates mod cases with a 10-second deduplication window.

**Tech Stack:** TypeScript, Sapphire Framework, Discord.js v14, Drizzle ORM, PostgreSQL

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/BhayanakClient.ts` | Add `GatewayIntentBits.GuildModeration` to client intents |
| `src/db/queries/modCases.ts` | Add `findRecentCase()` query for deduplication |
| `src/listeners/guild/guildAuditLogEntryCreate.ts` | New listener: receive audit log events, format embeds, post to log channel, create mod cases |
| `src/commands/config/config.ts` | Update `/config view` embed to mention log channel is for mod logs |

---

### Task 1: Add GuildModeration intent

**Files:**
- Modify: `src/lib/BhayanakClient.ts:50-58`

- [ ] **Step 1: Add `GatewayIntentBits.GuildModeration` to the intents array**

```typescript
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.DirectMessages,
				GatewayIntentBits.GuildModeration,
			],
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `pnpm build`
Expected: Clean build, no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/BhayanakClient.ts
git commit -m "feat(modlog): add GuildModeration intent for audit log events"
```

---

### Task 2: Add findRecentCase query helper

**Files:**
- Modify: `src/db/queries/modCases.ts`

- [ ] **Step 1: Add import for `gte`**

Add `gte` to the existing import from `drizzle-orm`:
```typescript
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
```

- [ ] **Step 2: Append `findRecentCase` function at end of file**

```typescript
export async function findRecentCase(
	guildId: string,
	userId: string,
	type: ModCase["type"],
	since: Date,
): Promise<ModCase | undefined> {
	return db.query.modCases.findFirst({
		where: and(
			eq(modCases.guildId, guildId),
			eq(modCases.userId, userId),
			eq(modCases.type, type),
			gte(modCases.createdAt, since),
		),
		orderBy: [desc(modCases.createdAt)],
	});
}
```

- [ ] **Step 3: Build to verify**

Run: `pnpm build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/db/queries/modCases.ts
git commit -m "feat(modlog): add findRecentCase query for deduplication"
```

---

### Task 3: Create guildAuditLogEntryCreate listener

**Files:**
- Create: `src/listeners/guild/guildAuditLogEntryCreate.ts`

- [ ] **Step 1: Write the listener file**

```typescript
import { Listener } from "@sapphire/framework";
import {
	EmbedBuilder,
	GuildAuditLogEntryCreatePayload,
	TextChannel,
	AuditLogEvent,
	Guild,
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
				const changes = entry.changes as Array<{ key: string; new?: Array<{ id: string }>; old?: Array<{ id: string }> }>;
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
```

- [ ] **Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/listeners/guild/guildAuditLogEntryCreate.ts
git commit -m "feat(modlog): add guildAuditLogEntryCreate listener"
```

---

### Task 4: Update config command help text

**Files:**
- Modify: `src/commands/config/config.ts:21`

- [ ] **Step 1: Update the `/config set` help example**

Change line 21 from:
```typescript
				set: { summary: "Set a configuration value for a specific setting.", examples: ["/config set setting:log-channel channel:#mod-log"] },
```

To:
```typescript
				set: { summary: "Set a configuration value for a specific setting.", examples: ["/config set setting:log-channel channel:#mod-log"] },
```

Actually, the example already mentions log-channel. Let's update the `view` embed to clarify what the log channel is for. Change line 145:

From:
```typescript
						`Log: ${settings.logChannelId ? `<#${settings.logChannelId}>` : "Not set"}`,
```

To:
```typescript
						`Mod Log: ${settings.logChannelId ? `<#${settings.logChannelId}>` : "Not set"}`,
```

- [ ] **Step 2: Build and format**

Run: `pnpm check`
Expected: Clean build, formatting applied

- [ ] **Step 3: Commit**

```bash
git add src/commands/config/config.ts
git commit -m "docs(config): clarify log channel is for moderation logs"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ `GuildModeration` intent added — Task 1
- ✅ Audit log listener created — Task 3
- ✅ Action mapping (ban, unban, kick, timeout, role mute/unmute) — Task 3
- ✅ Log embed posted to configured channel — Task 3
- ✅ Deduplication via `findRecentCase` — Task 2 + Task 3
- ✅ Mod case creation for manual actions — Task 3
- ✅ Error handling (missing channel, no permission) — Task 3
- ✅ Config integration (existing `logChannelId`) — Task 4

**2. Placeholder scan:**
- ✅ No TBD/TODO/fill-in-details
- ✅ All code blocks are complete
- ✅ All commands have expected output

**3. Type consistency:**
- ✅ `ModCase["type"]` used consistently
- ✅ `GuildAuditLogEntryCreatePayload` is the correct Discord.js type for the event
- ✅ `AuditLogEvent` enum used for action matching

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-mod-log-channel.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
