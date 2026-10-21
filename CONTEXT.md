# Context Glossary

## Archived Channel Message

A durable record of a non-bot Discord message observed in the configured source channel. It exists for database history and log retrieval, independent of whether the message can be used in a game. It keeps the original Discord message ID so the record can be traced back to the source message. Archived channel messages are retained indefinitely.

## Message Archive Retrieval

Database-side access to archived channel messages for history or log review. This does not imply any Discord-facing search or history command.

## Message Archive Backfill

The capped, repeat-safe process of importing accessible historical Discord messages from the Guess Who channel into the archived channel message table before live archiving has accumulated enough data. Backfill uses Discord message IDs to avoid duplicate archive records.

## Guess Who Channel

The Discord channel where messages are archived and where `/guess_who` rounds are allowed. For the current feature, this is channel `199168135935295488` only.

## Personality Training Corpus

The set of archived Discord messages considered for personality training. For this server, the corpus uses the same general chat source as the Guess Who Channel; personality training and `/guess_who` may apply different eligibility rules over the same archived messages.

Backfilled archived messages are valid personality training source material when they satisfy personality training eligibility. Deleted archived messages are not used for future profile generation.

If an archived message is deleted after it has already influenced an incremental profile update, the profile is not automatically rebuilt or purged. Deleted messages are excluded from future profile generation.

When an archived message has been edited, personality training uses the latest non-deleted archived content rather than attempting to preserve or analyze earlier message versions.

## Game-Eligible Message

An archived channel message that is safe and useful as a `/guess_who` prompt. Game eligibility is stricter than archival: short, command-like, link-only, mention-heavy, bot-authored, or too-recent messages are excluded from the game pool.

## Guess Who Original Author

The Discord user who wrote the game-eligible message selected for a `/guess_who` round. The original author's guesses are ignored during that round without revealing why.

## Guess Who Wrong Guess Limit

A `/guess_who` round allows three wrong guesses total across the channel. The limit is global to the round, not per player.

## Guess Who Prompt

The public `/guess_who` round message that presents an archived message as a polished embed. It shows the quote and remaining guesses, updates as guesses are spent, and is edited in place to reveal the original author and source message link when the round ends.

## Guess Who Round Timeout

A `/guess_who` round can stay active for up to ten minutes in its channel. If no correct guess arrives before timeout, the round ends and reveals the original author and source message link.

## Source Message Link

A Discord jump link to the original message represented by an archived channel message. Game reveals use this link so players can inspect the source message after the author is revealed.

## Palworld Tracker Category

The Discord category whose name carries the live online count (e.g. "Palworld — 4 online") and which holds the live Palworld player roster. The category's channel list *is* the roster: one text channel exists for exactly as long as its player is connected to the Palworld server. The category is owned by the bot — its contents are derived state, rewritten on every tracker sweep, not a place for durable conversation.

The category is identified by its exact tracker name pattern, not by a stored ID or a loose prefix, and is created on demand when missing. Its *existence* means "someone is playing": the bot hides the entire category when the server is Unreachable or when nobody is online, and recreates it when a sweep sees at least one player. Members cannot tell "server down" from "nobody online" by looking at the channel list; both are equally uninteresting, and an empty category would only be clutter.

The Minecraft tracker follows the same rules with its own category and player channels.

## Tracker Sweep

One pass of the Palworld tracker: fetch the connected players, compare them against the Palworld Player Channels currently in the Palworld Tracker Category, and create or delete channels so the two agree. A sweep is the only thing that mutates the category. Only a fetch that reports at least one player drives create/delete. A sweep that fails, or that reports nobody online, counts toward hiding the category; two such sweeps in a row hide it.

## Unreachable

The state entered after two consecutive sweeps that failed or saw nobody online, where "failed" means the game server did not answer with a usable response. Reaching it deletes the Palworld Tracker Category outright; the next sweep that sees a player recreates it. One isolated failure is not Unreachable — Palworld servers stall briefly during world saves, and a single stall must not tear down the roster.

## Palworld Player Channel

A Discord text channel inside the Palworld Tracker Category representing one player currently connected to the Palworld server. Its *name* pairs the player's platform account name with their current level — "account - level" — because members recognise each other by their Steam names, not by the in-game character names they reroll. The name is for humans only and is lossy: Discord lowercases it, dashes spaces, and strips characters, so it is never used to identify a player. Its *topic* carries the player's Palworld `userId` (platform account, stable across sessions and character rerolls), which is the identity key the tracker sweeps on. It is created when the player is first observed connected and deleted when the player is first observed disconnected.

A player's account name can be absent while they are still connecting, so the name falls back to the character name, and to a `userId`-derived label when neither is present — a channel with no name cannot exist.

The name is live, not a login snapshot: a sweep that observes a player under a different account name or at a different level renames their channel to match. A channel is renamed only when what it says has actually stopped being true, so a player whose name and level are unchanged is never renamed at all. Because Discord rewrites the name it is given, "unchanged" is judged on the letters and digits alone — a name that differs only in punctuation or spacing is left as it is, rather than being renamed on every sweep by a comparison that can never agree with itself. Because the channel is deleted on disconnect, any messages posted in it would be lost; the channel is therefore readable by everyone but writable by no one. It is a presence indicator, not a conversation, and its permissions say so rather than relying on members to infer it.

## Public Bot Stats Snapshot

A database-stored set of public marketing-site metrics written by the running bot after startup. The web app reads the latest snapshot from the database. If the bot is offline or fails to start, the web app may continue showing the most recent stored snapshot as stale data instead of inventing fallback numbers.

## Zen LLM Provider

The opencode Zen Go hosted model service, and the bot's only language model provider. It serves AI replies, summaries, and personality profile generation. When Zen is unconfigured, not permitted to receive Discord content, or neither the Primary Model nor the Backup Model gives a usable response, the feature degrades silently.

_Avoid_: Ollama, local model, fallback provider

## Primary Model

The Zen model every AI request goes to first.

## Backup Model

A second Zen model, from the same provider, that gets one try when the Primary Model fails or refuses. It is not a fallback provider: there is still only one provider.

_Avoid_: Fallback model, secondary provider

## Zen Session

The stable identifier Zen uses to group requests that belong to one conversation. For the bot, a conversation is one AI feature in one channel, or one profile being generated.

## Personality Training Message

A durable, non-deleted archived Discord message eligible to be used for user or guild personality profile generation. Personality training messages are the canonical source material for generated personality profiles; short-lived profile queues or counters are derived processing state, not the source of truth.

## Personality Training Eligibility

The rule set that decides whether an archived Discord message is suitable personality source material. Training eligibility is separate from game eligibility: a message may be archived for history, excluded from `/guess_who`, and still be useful for personality training, or vice versa.

Bot-authored messages and command invocations are not personality training eligible.

## User Personality Profile

A generated description of one Discord user's communication style within a specific guild. It is based on that user's personality training messages in that guild and should not be treated as a global identity across all servers.

User personality profiles may use backfilled personality training messages from the same guild.

A user personality profile may be viewed only by the member it describes and by the guild's administrators. Discord responses that show profile content are ephemeral, never posted into the channel.

Generated personality profiles describe communication patterns and should not reproduce direct quotes from source messages.

## Guild Personality Profile

A generated description of a Discord server's shared culture, tone, recurring topics, and social dynamics. It is not the sum of individual user personality profiles; it should be based on a balanced view of guild-level personality training messages so one high-volume user does not dominate the profile.

Guild personality generation should use author-balanced source material so high-volume users can influence the profile without overwhelming the server-level view.

Guild personality source material should preserve speaker separation, such as with stable anonymized author labels, so the profile can distinguish shared culture from one person's repeated messages.

Guild personality profiles should be available to server-context AI replies as culture and tone context, separate from any user personality profile used for the individual being answered.

Guild personality profiles may use historical eligible messages from users who are no longer active or no longer members, because those messages can still reflect the server's culture over time.

## Personality Profile Command Surface

The Discord-facing commands for viewing and rebuilding personality profiles. The command surface includes both user personality profiles and guild personality profiles; command names and web documentation should make that distinction explicit. Any member may view the guild personality profile; a member may view their own user profile, and administrators may view anyone's. Only administrators may force a refresh.

Normal AI replies may be shaped by personality profiles without announcing that profile context was used. The `/personality` command surface is the explicit way to inspect profile content.

## Personality Feature Toggle

A guild-level administrative switch that enables or disables personality collection and profile behavior for operational control. It is not a consent model and should not be described as opt-in or opt-out in domain language.

## Incremental Personality Profile Update

A profile generation pass that rewrites the existing personality profile in light of newly eligible personality training messages, keeping it within a fixed size. The whole profile shapes AI replies, so what `/personality view` shows is exactly what the bot uses. Incremental updates are the default behavior for both user and guild personality profiles.

Incremental updates may process personality training messages in bounded chunks. Chunking limits each prompt size, but eligible messages that do not fit in one pass remain available for later refreshes rather than being ignored.

## Personality Profile Refresh

A user- or admin-triggered incremental personality profile update. A refresh does not imply a full recomputation from all historical source messages; that separate operation is a rebuild.

During a refresh, newer evidence should be allowed to revise or soften older profile observations when user or guild behavior has changed.

## Personality Profile Rebuild

A full recomputation of a personality profile from historical personality training messages. Rebuilds are distinct from refreshes and are not the default profile update path.

## Personality Profile Evidence Threshold

The minimum amount of eligible personality training material required before a profile generation pass should run. First-time profile creation requires enough evidence to avoid weak or misleading profiles; later incremental refreshes may use a smaller threshold because they refine an existing profile.

## Personality E2E Test

An end-to-end personality test exercises the real profile-generation path against the Zen LLM Provider. Discord events and interactions may be mocked in-process, but the language model boundary is real; the test is opt-in, needs a Zen key, and skips otherwise.

Personality e2e tests are required when changes affect model prompts, the Zen integration, or profile-generation behavior. For unrelated changes, and in CI by default, they do not run.

Personality e2e tests assert observable behavior and profile structure rather than exact generated prose, because model output is nondeterministic.

## Presence

Whether a guild member is currently online, idle, do-not-disturb, or offline. Presence is about availability, not location: it says nothing about which voice channel, if any, the member is in.

## Voice State

A member's live voice attachment: which voice channel they are connected to, if any, plus mute, deaf, and streaming flags. Voice state is about location, not availability: a member can be online with no voice state, or in voice while idle.

## Occupancy

The rendered grouping of voice-attached members under their voice channel: who is connected, in which channel, and with whom. Occupancy is derived from voice states, never from presence.

## Widget Member

The anonymized member shape served by Discord's public widget endpoint: display name, avatar, presence status, and voice channel id when voice-attached. Widget members carry no bot flag and no durable user ids, so bots cannot be distinguished from humans in this shape alone.

## Guild Member

The bot's authoritative view of a server member: durable user id, bot flag, display name, avatar, and roles. Guild membership is about identity, independent of whether the member is currently present or in voice.

## Dashboard Presence Snapshot

The bot-published merge of guild members with widget presence for the homelab dashboard: one entry per currently present member with bot flag, avatar, presence status, and voice attachment. The snapshot is the dashboard's single source for occupancy and bot filtering; raw presence counts still originate from the widget endpoint.

## Moderation Case

A numbered, per-guild record of one moderator action against one member: warn, kick, mute, ban, tempban, or their reversals. Case numbers are sequential within a guild and never reused.

_Avoid_: Infraction, strike, log entry

## Active Case

A mute or tempban Moderation Case whose punishment is still in force. A case stops being active only when its punishment has actually been lifted, or when the bot has been removed from the guild and can no longer lift it. A failure to reach Discord never ends a punishment by itself; the bot keeps retrying.

## Current Punishment

The single ban-type and single mute-type punishment in force for a member in a guild. The latest moderator action wins: any new ban, tempban, or unban supersedes the member's other active ban-type cases, and any new mute or unmute supersedes their other active mute cases. Superseded cases are no longer active.

## Home Server

The one Discord guild the bot is built around, identified by the target guild setting. Home-Server Features run only here. The bot may be invited to other guilds, but they never receive Home-Server Features.

_Avoid_: Main guild, target server, primary guild

## Home-Server Feature

A feature locked to the Home Server: Guess Who, personality profiles, AI replies and summaries that send Discord content to an external model, the game-server trackers, and the dashboard presence snapshot.

## Mention Reply

An AI reply to a message that mentions the bot, in any channel of the Home Server. Mentioning the bot is an explicit request for a reply.

## Random Reply

An AI reply the bot posts without being asked, only in the Home Server, in its random-reply channel and at exactly its chance, and only when the channel is active (at least 5 human messages from at least 2 members in the last 10 minutes, the current one included) and at least 30 human messages have passed since the last Random Reply that was sent (a restart forgets it). Both channel and chance are on by default: the channel is the Guess Who Channel (#general) and the chance is 3%. An administrator can pick another channel, and a chance of 0 turns Random Replies off. It speaks in the Bot Voice.

## Bot Voice

The one personality every Mention Reply and Random Reply speaks with: a witty, playful roast in a few sentences, never genuinely hostile. The Guild Personality Profile shapes it, and so does the User Personality Profile of the member being answered. The bot sees its own earlier replies as part of the conversation.

_Avoid_: Persona, character

## AI Autoresponse

An autoresponse whose reply the model writes, following an administrator's prompt, instead of fixed text. It is a Home-Server Feature: it fires in any Home Server channel its own channel filter allows, and nowhere else. The Guild Personality Profile and the triggering member's User Personality Profile shape its tone alongside the administrator's prompt.

## One Reply Rule

A message gets at most one reply from the bot. A matching autoresponse (static or AI) answers first. Otherwise a Mention Reply answers. A Random Reply is posted only when nothing else answered.

## AI Outage

A run of consecutive AI requests where both the Primary Model and the Backup Model failed. Members still see nothing. The Home Server's moderation log channel gets one notice when an outage starts and one when a request succeeds again.

## Generic Feature

A feature any guild that invites the bot may use, such as moderation, music, leveling, giveaways, polls, reminders, and autoresponses. Generic Features are fully isolated per guild: no command in one guild may read or change another guild's data.

## Mention Policy

Bot messages notify nobody by default. A feature may notify only the specific members it exists to reach: the reminder owner, the levelled-up member, the newly joined member, and giveaway winners. Mass mentions are never sent. AI-generated replies notify nobody, even when they name members.

## Guess Who Guess

A message in the Guess Who Channel, during an active round, whose text explicitly mentions a member. The automatic mention Discord adds when replying to someone is not a guess, so ordinary reply chatter never spends the Guess Who Wrong Guess Limit.
