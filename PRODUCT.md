# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two equally weighted audiences:

1. **Server owners evaluating the bot** — Discord community owners/moderators browsing the public site to decide whether to add BhayanakBot to their server. Their job: understand what the bot does, trust that it works, and hit the invite CTA.
2. **Existing Bhayanak community members** — people already using the bot daily in the Bhayanak Discord (and its Minecraft/Palworld servers). Their job: look up commands, configuration, setup steps, changelog, and bot status.

## Product Purpose

BhayanakBot is a fully custom Discord bot bundling a broad feature set under one bot: moderation suite, music playback, leveling/rewards, RPG economy (currently disabled behind a feature flag), tickets, giveaways, polls, suggestions, reaction roles, archive-backed games (Guess Who), AI summaries/responder/personality profiles (gated), and Minecraft/Palworld server status. The website is its public face: landing page, command catalog and docs, setup guide, live status, and changelog. Success: a visitor can decide to invite the bot quickly, and a current user can find any command's documentation fast.

## Positioning

Flagship claim: **breadth under one bot** — moderation, music, levels, tickets, games, AI, and game-server tie-ins in a single self-contained bot, instead of stitching together a stack of single-purpose bots.

Explicitly NOT a durable commitment (user decision): "free / no ads / no paywall / self-hostable / MIT" is current-site copy describing today's reality, not binding positioning. Monetization/hosting trajectory is undecided; design must not hard-code these claims as permanent promises.

## Operating Context

- The product lives inside Discord; the website is secondary surface (Astro static site in `web/`, built with `pnpm web:build`).
- Self-hosted deployment via Docker Compose (Postgres, Valkey, Ollama, bot, web); data volumes live on NAS storage per recent compose changes.
- Ecosystem ties: `mc.bhayanak.net` Minecraft server (Homestead) and a Palworld tracker surface through `/minecraft` and status features.
- Subsystems are compile-time feature-switched (`src/lib/features.ts`): RPG, local LLM, and personality generation are currently off; the site/docs must reflect what is actually enabled.
- Live stats on the site come from a bot-published snapshot (`PUBLIC_STATS_INTERVAL_MS`).

## Capabilities and Constraints

- Command surface (~13 categories) is defined in the bot source; the web command catalog (`web/src/data/commands.ts`) and rich docs (`web/src/content/commands/`) MUST be updated in the same change whenever any Discord command is added, removed, renamed, or behaviorally modified.
- Invite URL is environment-provided (`PUBLIC_BOT_INVITE_URL`).
- AI responder/summaries require `ZEN_API_KEY` + `ZEN_ALLOW_DISCORD_CONTENT=true`; they degrade gracefully when unconfigured. Personality generation independently disabled.
- RPG commands exist in code but are unregistered while `RPG_ENABLED=false`.
- Terminology: "BhayanakBot", "Guess Who" (archive-backed quote-guessing game), "Homestead" (Minecraft server).
- Open decisions: whether the "NO ADS · NO PAYWALL"/"free · self-hostable · MIT" stickers stay given the non-binding stance above.

## Brand Commitments

- Name: **BhayanakBot** (binding).
- Voice: irreverent, confident, playful ("your server's worst behavior, automated") — incumbent voice carried by existing copy; not explicitly confirmed immutable, but new work should not drift corporate.

## Evidence on Hand

- Real, working feature set across moderation/music/leveling/games/tickets/giveaways — verifiable in `src/commands/` and README.
- Live stats pipeline feeding the landing page (servers, latency, commands run).
- Full command catalog data at `web/src/data/commands.ts` with MDX detail docs under `web/src/content/commands/`.
- Changelog data at `web/src/data/changelog.ts`.
- Absences: no testimonials, user quotes, benchmarks, download counts, or press. Future work must not fabricate any of these.

## Product Principles

1. **Breadth made legible** — many features, each discoverable; never let density become noise.
2. **Serve both readers** — the deciding owner and the daily user share surfaces; neither audience gets sacrificed.
3. **Honest status** — reflect what is actually enabled vs disabled; the site never oversells inactive subsystems.
4. **Bot-first truth** — the site documents real behavior; command docs move in lockstep with the bot.
