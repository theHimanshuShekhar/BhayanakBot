# Context Glossary

## Archived Channel Message

A durable record of a non-bot Discord message observed in the configured source channel. It exists for database history and log retrieval, independent of whether the message can be used in a game. It keeps the original Discord message ID so the record can be traced back to the source message. Archived channel messages are retained indefinitely.

## Message Archive Retrieval

Database-side access to archived channel messages for history or log review. This does not imply any Discord-facing search or history command.

## Message Archive Backfill

The capped, repeat-safe process of importing accessible historical Discord messages from the Guess Who channel into the archived channel message table before live archiving has accumulated enough data. Backfill uses Discord message IDs to avoid duplicate archive records.

## Guess Who Channel

The Discord channel where messages are archived and where `/guess_who` rounds are allowed. For the current feature, this is channel `199168135935295488` only.

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

## Public Bot Stats Snapshot

A database-stored set of public marketing-site metrics written by the running bot after startup. The web app reads the latest snapshot from the database. If the bot is offline or fails to start, the web app may continue showing the most recent stored snapshot as stale data instead of inventing fallback numbers.
