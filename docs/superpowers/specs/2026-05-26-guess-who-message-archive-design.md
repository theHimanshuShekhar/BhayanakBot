# Guess Who Message Archive Design

**Date:** 2026-05-26
**Scope:** Durable channel message archive, historical backfill, and `/guess_who` slash command game

## Overview

Add a `guess_who` game that uses real messages from channel `199168135935295488`. The bot archives non-bot messages from that channel into Postgres for long-term DBA-side history/log retrieval. The game draws only from a filtered game-eligible subset of archived messages so rounds are playable and do not expose low-quality prompts.

## Domain Terms

- **Archived channel message:** Durable Postgres record of a non-bot message observed in the Guess Who channel. It is retained indefinitely and keyed by the original Discord message ID.
- **Game-eligible message:** Archived message that passes filters for use as a `/guess_who` prompt.
- **Source message link:** Discord jump link to the original archived message. It is shown only when a round reveals the answer.
- **Message archive backfill:** Capped, repeat-safe startup import of accessible historical messages from the Guess Who channel.

## Data Model

Add a dedicated archive table rather than reusing `user_messages`, because the existing personality table is filtered, temporary, and lacks Discord message identity.

Proposed table: `archived_channel_messages`

| Column | Purpose |
|---|---|
| `message_id` | Original Discord message ID; primary key. |
| `guild_id` | Discord guild ID. |
| `channel_id` | Discord channel ID. |
| `author_user_id` | Discord user ID of the message author. |
| `author_username` | Global Discord username at archival/update time. |
| `author_display_name` | Server display name/nickname at archival/update time. |
| `content` | Message content used for history and possible game prompts. |
| `message_created_at` | Timestamp from the Discord message snowflake/API. |
| `archived_at` | When the bot first stored the row. |
| `updated_at` | When the archive row was last updated by edit/backfill. |
| `edited_at` | Discord edit timestamp when known. |
| `deleted_at` | Set when the bot observes deletion; deleted rows remain for history. |

Recommended indexes:

- Primary key on `message_id` to prevent duplicates.
- Index on `(guild_id, channel_id, message_created_at)` for DBA timeline queries.
- Index on `(guild_id, channel_id, author_user_id, message_created_at)` for DBA author history queries.
- Index on `(guild_id, channel_id, deleted_at, message_created_at)` to support game selection and DBA filtering.

## Archiving Flow

Live archiving happens through a small archive helper called from the existing `messageCreate` listener path.

Rules:

- Only archive messages from channel `199168135935295488`.
- Ignore bot-authored messages.
- Upsert by `message_id` so duplicate records are impossible.
- Store message content, Discord author ID, global username, server display name, guild ID, channel ID, and message timestamp.
- Keep records indefinitely.

Edit/delete handling:

- `messageUpdate` updates the archive row for the same `message_id` with the latest content and `edited_at` when the message belongs to the Guess Who channel.
- `messageDelete` keeps the archive row and sets `deleted_at` when the message belongs to the Guess Who channel.
- `/guess_who` never selects rows with `deleted_at` set.

## Historical Backfill

On startup, the bot imports accessible historical messages from channel `199168135935295488` before or alongside normal operation.

Rules:

- Backfill is capped by `GUESS_WHO_BACKFILL_LIMIT`.
- Default cap is `1000` messages.
- Backfill paginates Discord channel history and imports up to the cap.
- Backfill ignores bot-authored messages.
- Backfill upserts by `message_id`, so repeated starts do not create duplicate rows.
- If fewer than the cap are accessible, import whatever Discord returns.
- Backfill failure should be logged but should not prevent the bot from logging in or running other features.

## Game Eligibility

The archive is broader than the game pool. `/guess_who` selects only archived messages that are safe and useful as prompts.

Recommended filters:

- `channel_id = 199168135935295488`
- `deleted_at IS NULL`
- content length between 15 and 300 characters
- not starting with `/` or `!`
- not link-only
- not containing `@everyone` or `@here`
- not authored by the player who invoked `/guess_who`
- older than one hour to reduce obvious current-conversation guesses

If no eligible message is available, the command responds ephemerally with a clear message that more chat history is needed.

## Slash Command Flow

Command: `/guess_who`

Rules:

- Only works in channel `199168135935295488`.
- One active round per channel.
- Active round timeout is 10 minutes.
- The prompt is a polished embed showing the archived message content and remaining guesses.
- The session embed is edited in place after each wrong guess to update the remaining guess count.
- The original author and source message link are hidden until reveal.
- Players guess by mentioning a Discord user in the channel.
- The original author’s guesses are silently ignored so the bot does not spoil the round.
- Wrong guesses are counted globally for the round, not per user.
- After 3 wrong guesses, the bot reveals the answer by editing the same session embed.
- A correct guess reveals the answer immediately by editing the same session embed.
- Timeout reveals the answer by editing the same session embed.

Reveal content:

- Original author mention, with archived display name available in the embed text.
- How long ago the message was sent, using Discord relative timestamp formatting.
- Source message link using `https://discord.com/channels/{guildId}/{channelId}/{messageId}`.
- Original message ID, visible as text.
- Final guess outcome, such as correct guess, exhausted guesses, or timeout.

## Session Storage

Use in-memory active game sessions keyed by channel ID.

Rationale:

- Active rounds are short-lived and casual.
- Persistence is unnecessary for a 10-minute game.
- Restarting the bot may abandon a round, which is acceptable.
- The durable part of the feature is the archive, not active gameplay state.

## Error Handling

| Scenario | Behavior |
|---|---|
| Command used outside channel `199168135935295488` | Ephemeral error. |
| Round already active in channel | Ephemeral error. |
| No game-eligible archived messages | Ephemeral error asking for more archived chat history. |
| Backfill fails | Log error and continue startup. |
| Archive insert/update fails during live message handling | Log error and continue normal message processing. |
| Original author guesses | Ignore silently. |
| Guess does not mention a user | Ignore. |
| Message deleted before reveal | Reveal still includes author and message ID; source link may no longer resolve. |
| Session embed edit fails | End the session and send a fallback reveal message. |

## Testing

Unit tests should cover:

- Game eligibility filters.
- Archive upsert query behavior where practical.
- Random eligible message selection excludes deleted/current-user/too-recent rows.
- Correct guess, wrong-guess reveal, original-author ignored, and timeout behavior at the helper/session layer where possible.

Smoke/build verification:

- `pnpm lint`
- `pnpm test` or targeted tests if local Postgres is unavailable
- `pnpm build`

## Non-Goals

- No Discord-facing archive search/history command.
- No per-guild configuration UI for archive channel in the first version.
- No rewards/XP/coins for `/guess_who` in the first version.
- No persisted active round recovery after bot restart.
