# Schedule background tasks in-process, without Valkey or BullMQ

Every background task (mute and tempban expiry, reminders, polls, giveaways, the game-server trackers, the stats and presence publishers) already ran from plain `setInterval` timers in the bot process; the Sapphire scheduled-tasks plugin, BullMQ, and Valkey were wired up but never scheduled a single job. We removed the plugin, BullMQ, ioredis, the Valkey service, and `VALKEY_URL`, and made the tasks plain modules driven by in-process intervals with per-task overlap guards.

## Considered Options

Moving the intervals into BullMQ repeatable jobs would have made Valkey earn its keep with persistent schedules and retries. It was rejected because the bot runs as a single process, every task already re-derives its work from Postgres on each tick (so a restart loses nothing), and a queue would add a container, a dependency tree, and a failure mode for no observed benefit.

## Consequences

The bot must remain a single instance: running two bot processes against one database would execute every task twice. If the bot is ever sharded or horizontally scaled, a distributed lock or a real job queue has to come back first. Durability of scheduled work lives entirely in Postgres rows (`expires_at`, `remind_at`, `ends_at`), never in the scheduler.
