# Mod Log Channel Design

## 1. Overview & Goals

When any moderation action happens in a guild — whether via the bot's `/ban` command or a manual right-click ban by an admin — the bot posts a rich embed to a configured log channel. This gives moderators a single, chronological view of all enforcement activity.

**Goals:**
- Capture both bot-command and manual Discord moderation actions
- Integrate with existing `modCases` so `/history` shows the full picture
- Zero duplicate entries when the bot itself triggers an action
- Configurable per-guild (opt-in via `/config`)

## 2. Architecture

**Intent:** Add `GatewayIntentBits.GuildModeration` to `BhayanakClient`.

**New Listener:** `guildAuditLogEntryCreate` (`src/listeners/guild/guildAuditLogEntryCreate.ts`)
- Fires in real-time for every audit log entry
- Receives `(entry: GuildAuditLogEntry, guild: Guild)`
- Checks `guildSettings.logChannelId` — if unset, returns silently
- Formats and posts an embed to the log channel
- For moderation actions (ban, kick, timeout, role changes), also creates a `modCases` row if no recent duplicate exists

**Flow:**
```
Discord audit log event → Listener → Filter by action type → Format embed → Post to log channel
                                    ↓
                              If moderation action → Check for recent duplicate case → Create modCases row
```

## 3. Audit Log Action Mapping

| Discord Action Type | Log Embed Content | Create modCases? |
|---|---|---|
| `MemberBanAdd` | User banned, executor, reason | Yes → `type: "ban"` |
| `MemberBanRemove` | User unbanned, executor | Yes → `type: "unban"` |
| `MemberKick` | User kicked, executor, reason | Yes → `type: "kick"` |
| `MemberUpdate` (timeout) | User timed out, duration, executor | Yes → `type: "mute"`, `duration: timeoutMs`, `expiresAt: timeoutEnd` |
| `MemberRoleUpdate` (add muted role) | User muted via role, executor | Yes → `type: "mute"` (only if role matches `guildSettings.mutedRoleId`) |
| `MemberRoleUpdate` (remove muted role) | User unmuted via role, executor | Yes → `type: "unmute"` (only if role matches `guildSettings.mutedRoleId`) |
| `MessageDelete` (by mod) | Message deleted by mod, channel, content preview | No (too noisy) |
| `MessageBulkDelete` | N messages bulk-deleted in #channel | No |
| `ChannelOverwriteUpdate` | Permission override changed, target, before/after | No |
| Other | Skipped silently | No |

## 4. Deduplication Strategy

**Problem:** When `/ban` runs, it already calls `createCase()`. The audit log event for that same ban would create a second case.

**Solution:** Before creating a case from an audit log event, query `modCases` for an existing row with:
- Same `guildId`, `userId`, `type`
- `createdAt` within the last **10 seconds** of the audit log entry's creation time

If found, skip case creation. The embed is still posted to the log channel (the log is a chronological feed, duplicates there are fine and actually expected for transparency).

## 5. Database Changes

**No schema changes required.** The existing `modCases` table already supports everything we need.

**One query addition in `modCases.ts`:**
```ts
export async function findRecentCase(
  guildId: string, userId: string, type: ModCaseType, since: Date
): Promise<ModCase | undefined>
```

## 6. Commands

**No new commands.** The existing `/config` command already has `logChannelId`. We just need to ensure the help text mentions it.

**Updates to existing commands:**
- `/case` and `/history` — already read `modCases`. They'll automatically show manual actions once the listener starts creating cases for them.

## 7. Error Handling & Edge Cases

- **Bot lacks `ViewAuditLog` permission:** Listener catches and logs, skips silently
- **Log channel deleted or bot can't post:** Log the failure, don't crash
- **Audit log entry has no executor (system action):** Embed shows "System" as moderator
- **Reason field exceeds 1024 chars (embed field limit):** Truncate with `…`
- **Bot was offline during action:** Event is missed. Acceptable trade-off for real-time approach.
