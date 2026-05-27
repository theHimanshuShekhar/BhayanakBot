# Public Bot Stats Design

## Context

The Astro web app currently displays hardcoded public bot stats. The bot already has a Postgres database through Drizzle, and stale public stats are acceptable when the bot is offline. The site should show real bot-backed data without adding a separate metrics service.

## Goals

- Track a durable bot-wide count of successfully run Discord commands.
- Let the bot write public stats snapshots on startup and at a fixed interval.
- Let the web app read the latest stored snapshot and tolerate stale data.
- Keep the documented command count and category count sourced from `web/src/data/commands.ts`.

## Non-Goals

- No real-time streaming metrics.
- No per-guild or per-user public stats.
- No external observability or metrics service.
- No changes to command behavior or command documentation content.

## Recommended Approach

Use two small DB-backed models:

- `bot_command_counters`: a single durable counter row for bot-wide `commandsRun`.
- `public_bot_stats_snapshots`: latest public snapshot values written by the bot and read by the web app.

This keeps the web app simple, avoids fake public stats, and works when the bot is offline because the latest snapshot remains in the database.

## Data Model

`bot_command_counters` stores one row keyed by a stable counter name, initially `global`. It contains `commandsRun` and timestamp metadata. Incrementing commands is an atomic database update with insert-on-conflict behavior so first use creates the row.

`public_bot_stats_snapshots` stores public, non-sensitive values:

- `guilds`: current Discord guild count from the ready client cache.
- `commandsRun`: durable bot-wide command counter value.
- `latencyMs`: current websocket ping if available.
- `capturedAt`: when the bot wrote the snapshot.

Only the latest snapshot is needed by consumers. The implementation may keep historical rows or upsert a single `latest` row; the preferred minimal version is a single stable row because no history requirement exists.

## Bot Data Flow

The command lifecycle listener increments `commandsRun` only after a Discord command successfully runs. This avoids counting failed precondition checks or failed command executions as successful runs.

After the client is ready, the bot writes an initial public stats snapshot. It then schedules repeated writes using a fixed interval. If a snapshot write fails, the bot logs the error and continues running; the web app can keep reading the previous row.

## Web Data Flow

The Astro app reads the latest public stats snapshot from Postgres at build/server render time. It uses DB values for live bot-backed stats and local command catalog data for documented commands and categories.

If no snapshot exists, the web app falls back to safe unavailable values instead of fake marketing numbers. The page should still build and render.

## Configuration

Add a fixed-interval setting for snapshot writes. The default should be conservative enough for production and tests should not depend on real timers. `PUBLIC_STATS_INTERVAL_MS` is a reasonable environment variable name.

## Testing

Use TDD for implementation:

- Query tests for command counter creation and atomic increment behavior.
- Query tests for writing and retrieving the latest public stats snapshot.
- A stale snapshot test that confirms retrieval still returns the latest stored data.
- Lightweight listener or helper tests for counting only successful command runs where practical.

The implementation should use real query code in tests and avoid mocks unless Discord client objects make a focused unit boundary necessary.

## Error Handling

Command counter increment failures should be logged but should not break user command execution. Snapshot write failures should be logged and retried on the next interval. Web reads should fail closed to unavailable values rather than rendering fake stats.

## Open Decisions Resolved

- Public-facing label is `commands run`, not `crimes committed`.
- The counter is bot-wide and durable.
- Stale snapshot data is acceptable if the bot is offline.
- Command and category totals remain derived from the web command catalog.
