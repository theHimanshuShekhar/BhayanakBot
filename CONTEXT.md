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

The Discord category whose name carries the live online count (e.g. "Bhayanak Palworld — 4 online") and which holds the live Palworld player roster. The category's channel list *is* the roster: one text channel exists for exactly as long as its player is connected to the Palworld server. The category is owned by the bot — its contents are derived state, rewritten on every tracker sweep, not a place for durable conversation.

The category is identified by name, not by a stored ID, and is created on demand when missing. Its *existence* encodes reachability: the bot deletes the entire category when the Palworld server is unreachable and recreates it on the next successful sweep. So an absent category means "the bot cannot see the server", while a present category with no player channels means "the server is up and nobody is online" — the two states are never confused.

## Tracker Sweep

One pass of the Palworld tracker: fetch the connected players, compare them against the Palworld Player Channels currently in the Palworld Tracker Category, and create or delete channels so the two agree. A sweep is the only thing that mutates the category. Only a successful fetch drives create/delete; a successful fetch reporting nobody online is meaningful and clears the player channels without touching the category itself. Two consecutive failed sweeps mean the server is Unreachable.

## Unreachable

The state entered after two consecutive failed sweeps, where "failed" means the Palworld API did not answer with a usable response. Reaching it deletes the Palworld Tracker Category outright; the next successful sweep recreates it. One isolated failure is not Unreachable — Palworld servers stall briefly during world saves, and a single stall must not tear down the roster.

## Palworld Player Channel

A Discord text channel inside the Palworld Tracker Category representing one player currently connected to the Palworld server. Its *name* pairs the player's platform account name with their current level — "account - level" — because members recognise each other by their Steam names, not by the in-game character names they reroll. The name is for humans only and is lossy: Discord lowercases it, dashes spaces, and strips characters, so it is never used to identify a player. Its *topic* carries the player's Palworld `userId` (platform account, stable across sessions and character rerolls), which is the identity key the tracker sweeps on. It is created when the player is first observed connected and deleted when the player is first observed disconnected.

A player's account name can be absent while they are still connecting, so the name falls back to the character name, and to a `userId`-derived label when neither is present — a channel with no name cannot exist.

The level in the name is live, not a login snapshot: a sweep that observes a player at a different level renames their channel to match. A channel is renamed only when what it says has actually stopped being true, so a player who does not level up is never renamed at all. Because the channel is deleted on disconnect, any messages posted in it would be lost; the channel is therefore readable by everyone but writable by no one. It is a presence indicator, not a conversation, and its permissions say so rather than relying on members to infer it.

## Public Bot Stats Snapshot

A database-stored set of public marketing-site metrics written by the running bot after startup. The web app reads the latest snapshot from the database. If the bot is offline or fails to start, the web app may continue showing the most recent stored snapshot as stale data instead of inventing fallback numbers.

## Zen LLM Provider

The opencode Zen hosted model endpoint used first for Discord responder replies and user or guild personality profile generation. It is distinct from the legacy local Ollama provider, which remains the primary provider for RPG, quest, and other non-responder bot features. Responder and personality generation fall back to Ollama when Zen is unconfigured or returns an unusable response.

## Personality Training Message

A durable, non-deleted archived Discord message eligible to be used for user or guild personality profile generation. Personality training messages are the canonical source material for generated personality profiles; short-lived profile queues or counters are derived processing state, not the source of truth.

## Personality Training Eligibility

The rule set that decides whether an archived Discord message is suitable personality source material. Training eligibility is separate from game eligibility: a message may be archived for history, excluded from `/guess_who`, and still be useful for personality training, or vice versa.

Bot-authored messages and command invocations are not personality training eligible.

## User Personality Profile

A generated description of one Discord user's communication style within a specific guild. It is based on that user's personality training messages in that guild and should not be treated as a global identity across all servers.

User personality profiles may use backfilled personality training messages from the same guild.

User personality profiles may be viewed by guild members for users in the same guild. Discord responses that show profile content should remain ephemeral rather than posting the profile directly into the channel.

Generated personality profiles describe communication patterns and should not reproduce direct quotes from source messages.

## Guild Personality Profile

A generated description of a Discord server's shared culture, tone, recurring topics, and social dynamics. It is not the sum of individual user personality profiles; it should be based on a balanced view of guild-level personality training messages so one high-volume user does not dominate the profile.

Guild personality generation should use author-balanced source material so high-volume users can influence the profile without overwhelming the server-level view.

Guild personality source material should preserve speaker separation, such as with stable anonymized author labels, so the profile can distinguish shared culture from one person's repeated messages.

Guild personality profiles should be available to server-context AI replies as culture and tone context, separate from any user personality profile used for the individual being answered.

Guild personality profiles may use historical eligible messages from users who are no longer active or no longer members, because those messages can still reflect the server's culture over time.

## Personality Profile Command Surface

The Discord-facing commands for viewing and rebuilding personality profiles. The command surface includes both user personality profiles and guild personality profiles; command names and web documentation should make that distinction explicit.

Normal AI replies may be shaped by personality profiles without announcing that profile context was used. The `/personality` command surface is the explicit way to inspect profile content.

## Personality Feature Toggle

A guild-level administrative switch that enables or disables personality collection and profile behavior for operational control. It is not a consent model and should not be described as opt-in or opt-out in domain language.

## Incremental Personality Profile Update

A profile generation pass that preserves the existing personality profile and refines it with newly eligible personality training messages. Incremental updates are the default behavior for both user and guild personality profiles.

Incremental updates may process personality training messages in bounded chunks. Chunking limits each prompt size, but eligible messages that do not fit in one pass remain available for later refreshes rather than being ignored.

## Personality Profile Refresh

A user- or admin-triggered incremental personality profile update. A refresh does not imply a full recomputation from all historical source messages; that separate operation is a rebuild.

During a refresh, newer evidence should be allowed to revise or soften older profile observations when user or guild behavior has changed.

## Personality Profile Rebuild

A full recomputation of a personality profile from historical personality training messages. Rebuilds are distinct from refreshes and are not the default profile update path.

## Personality Profile Evidence Threshold

The minimum amount of eligible personality training material required before a profile generation pass should run. First-time profile creation requires enough evidence to avoid weak or misleading profiles; later incremental refreshes may use a smaller threshold because they refine an existing profile.

## Personality E2E Test

An end-to-end personality test should exercise the real profile-generation path with Ollama when a local model is available. Discord events and interactions may be mocked in-process, but the language model boundary should be real for at least one e2e path; tests may skip gracefully when Ollama is unavailable.

Real-Ollama personality e2e tests are required when changes affect model prompts, Ollama integration, or profile-generation behavior. For unrelated changes, they are opt-in rather than part of every default test run.

Real-Ollama personality e2e tests should assert observable behavior and profile structure rather than exact generated prose, because model output is nondeterministic.
