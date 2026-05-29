# Rich Command Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rich MDX documentation pages for every current command in the web app, with content strictly based on actual command implementation.

**Architecture:** Keep the existing Astro command detail renderer and content collection schema. Add one MDX content file per `RAW_COMMANDS` slug and correct `web/src/data/commands.ts` so catalog metadata and rich pages agree with command source code.

**Tech Stack:** Astro content collections, MDX frontmatter, TypeScript command catalog, Sapphire/Discord.js command source files, pnpm validation commands.

---

### Task 1: Audit Command Source And Catalog

**Files:**
- Read: `src/commands/**/*.ts`
- Read: `src/lib/**/*.ts` only where command behavior delegates to helpers
- Modify: `web/src/data/commands.ts`

- [ ] **Step 1: Build the current command list from source**

Use `src/commands/**/*.ts` as source of truth. Confirm actual command names, subcommands, option names, permissions, and examples. Pay special attention to command names that differ from filenames or current catalog names.

- [ ] **Step 2: Correct catalog metadata**

Update `web/src/data/commands.ts` so current catalog entries match source. Include these known corrections:

```ts
// Use actual command names where source differs from current catalog:
"/music"
"/reactionrole"
"/rolemenu"

// Use actual option/subcommand examples where current catalog is stale:
"/inventory view"
"/inventory use item:lucky_charm"
"/inventory equip item:pickaxe"
"/pet adopt pet:cat"
"/pet rename pet:cat name:Whiskers"
"/property buy property:studio_apartment"
"/property view"
"/poll question:\"Best language?\" option1:Python option2:JS option3:Go option4:Rust"
"/ticket open subject:billing issue"
"/suggestion deny id:3 reason:Out of scope"
```

- [ ] **Step 3: Add subcommand metadata where useful**

Add `subcommands` objects for commands where the implementation exposes named subcommands and the catalog currently lacks them, including `/shop`, `/inventory`, `/pet`, `/property`, `/afk`, `/remind`, `/rewards`, `/ticket`, `/reactionrole`, `/rolemenu`, `/giveaway`, `/config`, and `/autorespond`.

- [ ] **Step 4: Verify catalog TypeScript compiles through web build later**

Do not run the full build yet unless this task is executed standalone. The final task runs `pnpm web:build`.

### Task 2: Add RPG Command MDX Pages

**Files:**
- Create/update: `web/src/content/commands/profile.mdx`
- Update: `web/src/content/commands/train.mdx`
- Update: `web/src/content/commands/work.mdx`
- Update: `web/src/content/commands/crime.mdx`
- Create/update: `web/src/content/commands/shop.mdx`
- Create/update: `web/src/content/commands/inventory.mdx`
- Create/update: `web/src/content/commands/pet.mdx`
- Create/update: `web/src/content/commands/property.mdx`
- Create/update: `web/src/content/commands/daily.mdx`
- Create/update: `web/src/content/commands/quests.mdx`

- [ ] **Step 1: Create one MDX page per RPG command slug**

Each page must include valid frontmatter matching `web/src/content.config.ts`: `name`, `cat`, `tags`, `summary`, `syntax`, `examples`, and `related`. Use `variants` only for commands where a compact variant grid accurately represents code-backed choices.

- [ ] **Step 2: Use accurate RPG behavior from code**

Document cooldowns, costs, stat effects, jail behavior, item use/equip behavior, pet adoption/rename behavior, property collection, daily streaks, and daily quests only when present in source.

- [ ] **Step 3: Add short body copy for complex RPG commands**

Use body text for `/shop`, `/inventory`, `/pet`, `/property`, and `/quests` when frontmatter examples are not enough to explain subcommand behavior.

### Task 3: Add Moderation Command MDX Pages

**Files:**
- Create/update: `web/src/content/commands/ban.mdx`
- Create/update: `web/src/content/commands/kick.mdx`
- Create/update: `web/src/content/commands/mute.mdx`
- Create/update: `web/src/content/commands/unmute.mdx`
- Create/update: `web/src/content/commands/warn.mdx`
- Create/update: `web/src/content/commands/unban.mdx`
- Create/update: `web/src/content/commands/purge.mdx`
- Create/update: `web/src/content/commands/case.mdx`
- Create/update: `web/src/content/commands/history.mdx`

- [ ] **Step 1: Create one MDX page per moderation command slug**

Use realistic examples and embeds that reflect successful command outcomes.

- [ ] **Step 2: Include implementation-backed constraints**

Document required moderator/admin access, temporary ban/mute expiration when implemented, muted-role requirement for `/mute`, purge amount/filter behavior, Discord's 14-day bulk-delete limit, `/case edit` reason-only editing, and `/history` result limits.

### Task 4: Add Music Command MDX Pages

**Files:**
- Update: `web/src/content/commands/play.mdx`
- Create/update: `web/src/content/commands/music.mdx`
- Create/update: `web/src/content/commands/queue.mdx`
- Create/update: `web/src/content/commands/nowplaying.mdx`
- Create/update: `web/src/content/commands/volume.mdx`
- Create/update: `web/src/content/commands/shuffle.mdx`
- Create/update: `web/src/content/commands/loop.mdx`

- [ ] **Step 1: Create one MDX page per music command slug**

The controls page must use the actual `/music` command name and its subcommands. Do not create `/controls.mdx` unless the catalog still contains `/controls`, which it should not after Task 1.

- [ ] **Step 2: Include voice/player constraints**

Document user voice-channel requirements, queue requirements, DJ precondition where configured, volume range `0–100`, and loop modes exactly as implemented.

### Task 5: Add Utility, Fun, Games, And Leveling MDX Pages

**Files:**
- Create/update utility: `web/src/content/commands/ping.mdx`, `serverinfo.mdx`, `userinfo.mdx`, `avatar.mdx`, `snipe.mdx`, `editsnipe.mdx`, `afk.mdx`, `remind.mdx`, `summarize.mdx`, `personality.mdx`, `help.mdx`
- Create/update fun/games: `web/src/content/commands/8ball.mdx`, `coinflip.mdx`, `choose.mdx`, `meme.mdx`, `poll.mdx`, `guess-who.mdx`
- Create/update leveling: `web/src/content/commands/rank.mdx`, `leaderboard.mdx`, `rewards.mdx`, `level-reset.mdx`

- [ ] **Step 1: Create compact pages for simple commands**

Use compact frontmatter-only pages for `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/snipe`, `/editsnipe`, `/help`, `/8ball`, `/coinflip`, `/choose`, `/meme`, `/rank`, and `/leaderboard` unless code shows important constraints that need body text.

- [ ] **Step 2: Create fuller pages for stateful commands**

Use short body text for `/afk`, `/remind`, `/summarize`, `/personality`, `/poll`, `/guess_who`, `/rewards`, and `/level-reset` to document subcommands, cooldowns, limits, permissions, or channel restrictions.

### Task 6: Add Server-System MDX Pages

**Files:**
- Create/update: `web/src/content/commands/ticket-panel.mdx`
- Create/update: `web/src/content/commands/ticket.mdx`
- Create/update: `web/src/content/commands/reactionrole.mdx`
- Create/update: `web/src/content/commands/rolemenu.mdx`
- Create/update: `web/src/content/commands/giveaway.mdx`
- Create/update: `web/src/content/commands/suggest.mdx`
- Create/update: `web/src/content/commands/suggestion.mdx`
- Create/update: `web/src/content/commands/config.mdx`
- Create/update: `web/src/content/commands/autorespond.mdx`
- Create/update: `web/src/content/commands/minecraft.mdx`

- [ ] **Step 1: Create one MDX page per server-system command slug**

Use the actual command slugs from corrected catalog data.

- [ ] **Step 2: Add body copy for complex management commands**

Use body text for `/ticket`, `/reactionrole`, `/rolemenu`, `/giveaway`, `/config`, and `/autorespond` because these have multiple subcommands and operational constraints.

### Task 7: Verify Complete Rich Coverage

**Files:**
- Read: `web/src/data/commands.ts`
- Read: `web/src/content/commands/*.mdx`

- [ ] **Step 1: Check every catalog slug has an MDX file**

Run a small Node/TypeScript-compatible check or use existing project tooling to compare `COMMANDS.map((c) => c.slug)` against MDX basenames. Expected result: no missing command docs.

- [ ] **Step 2: Run Astro build**

Run: `pnpm web:build`

Expected: build succeeds and content collection schema accepts every MDX file.

- [ ] **Step 3: Run repository check if needed**

Run: `pnpm check`

Expected: Biome check completes. If Biome rewrites files, review the diff and ensure only intended docs/catalog formatting changed.

- [ ] **Step 4: Review final diff**

Run: `git diff -- web/src/data/commands.ts web/src/content/commands docs/superpowers/specs/2026-05-30-rich-command-docs-design.md docs/superpowers/plans/2026-05-30-rich-command-docs.md`

Expected: diff contains only command documentation, catalog corrections, and planning docs.
