# Paginated `/help` Command Design

**Date:** 2026-04-21
**Scope:** A single `/help` slash command that lets users browse every bot command by category, drill into any specific command, and jump straight to a category via an argument.

---

## Overview

Users currently have no in-bot way to discover what commands exist. This spec adds a paginated, three-level `/help` command:

1. **Overview** — lists all categories.
2. **Category page** — lists commands in a category with one-line summaries.
3. **Command detail** — shows the command's description, usage notes, subcommands, and examples.

Help metadata lives alongside each command via a new `help` field on Sapphire's `Command.Options`. The help command walks the command store at render time and produces embeds from that metadata.

Response is **ephemeral** (only the invoker sees it). Navigation uses Discord components (select menus + buttons). Gated commands (moderator / admin / DJ) are shown to everyone but marked with an icon.

---

## Architecture

### Files

| File | Purpose |
|---|---|
| `src/commands/utility/help.ts` | `/help` slash command. Handles initial render (overview or direct category entry). |
| `src/interaction-handlers/helpButtons.ts` | Handles `help:*` button clicks (Prev, Next, Back, Overview). |
| `src/interaction-handlers/helpSelectMenu.ts` | Handles category/command select menus. |
| `src/lib/help/types.ts` | `CommandHelp`, `CategoryMeta` types. |
| `src/lib/help/categories.ts` | Category display metadata (label, emoji, description). Keyed by directory name. |
| `src/lib/help/render.ts` | Pure builders: `buildOverview()`, `buildCategoryPage()`, `buildCommandDetail()`. Returns `{ embed, components }`. |
| `src/lib/help/collect.ts` | Walks `container.stores.get("commands")` to build a category → commands map. Memoized after first call. |
| `src/lib/sapphire-augments.ts` | Module augmentation adding `help?: CommandHelp` to `Command.Options` and `Command`. |
| All ~55 existing command files | Add `help: { summary, examples, subcommands?, usageNotes? }` in their `super()` options. |

### customId namespace

All help interactions use the `help:` prefix, consistent with the existing `rpgshop:`, `rpgjail:`, `rpginv:` patterns.

- `help:cat:<categoryId>:<page>` — navigate to category page (button).
- `help:cmd:<commandName>:<categoryId>:<page>` — navigate to command detail (button). The trailing `<categoryId>:<page>` encodes where the user came from so the detail page's "Back to category" returns to the correct page.
- `help:home` — return to overview (button).
- `help:select:cat` — category selector (select menu). Selected value is a category id.
- `help:select:cmd:<categoryId>:<page>` — command selector on a category page (select menu). Selected value is a command name; the customId carries the current page so the resulting detail page can link back to it.

---

## Data model

```ts
// src/lib/help/types.ts

export interface SubcommandHelp {
  summary: string;
  examples: string[];
}

export interface CommandHelp {
  summary: string;                               // one-line description shown on category page + detail page
  examples: string[];                            // ready-to-copy /command strings
  usageNotes?: string;                           // optional longer explanation on detail page
  subcommands?: Record<string, SubcommandHelp>;  // keyed by subcommand name
}

export interface CategoryMeta {
  id: string;          // matches directory name, e.g. "rpg"
  label: string;       // display name, e.g. "RPG & Economy"
  emoji: string;       // e.g. "⚔️"
  description: string; // one-line shown on the overview
}
```

### Type augmentation

```ts
// src/lib/sapphire-augments.ts
import type { CommandHelp } from "./help/types.js";

declare module "@sapphire/framework" {
  interface CommandOptions { help?: CommandHelp; }
  interface Command        { help?: CommandHelp; }
}
```

This matches the pattern already used in `src/lib/BhayanakClient.ts` to extend `SapphireClient`.

### Using the field in a command

```ts
super(context, {
  ...options,
  help: {
    summary: "Ban a user from the server",
    examples: ['/ban user:@spammer reason:"raid"', '/ban user:@x days:7'],
  },
});
```

---

## UI flow

### Level 0 — Overview

Triggered by `/help` with no category argument, or by `help:home` button.

- Embed title: `📖 Bot Commands`
- Embed description: short intro ("Pick a category below to see its commands.").
- One field per category: `⚔️ RPG & Economy` → one-line description + command count (e.g. "9 commands").
- Components:
  - Row 1: `StringSelectMenu` (`help:select:cat`) with placeholder "Jump to a category…" and every category as an option.

### Level 1 — Category page

Triggered by the category select, `help:cat:<id>:<page>` button, or `/help category:<id>`.

- Embed title: `⚔️ RPG & Economy`
- Embed description: category intro.
- One field per command on the current page: `/profile` → one-line summary. Gated commands prefixed with permission markers.
- Embed footer: `Page 1/2 · N commands` (only shown when paginated).
- Components:
  - Row 1: `StringSelectMenu` (`help:select:cmd:<categoryId>:<page>`) — "View details…", options = commands on the current page.
  - Row 2: `[⬅ Overview]` is always present. If the category paginates, `[◀ Prev]` and `[▶ Next]` are added to the same row (disabled at bounds). Single-page categories just show `[⬅ Overview]`.

**Pagination threshold:** 8 commands per page. Only `rpg` (9 commands) currently exceeds this.

### Level 2 — Command detail

Triggered by the command select or `help:cmd:<commandName>:<categoryId>:<page>` button.

- Embed title: `/ban 🛡️`
- Embed description: `summary` + (if present) `usageNotes`.
- Field "Examples": bulleted list in a code block (one entry per example).
- Field per subcommand (if any): `/shop buy` → subcommand summary + examples code block.
- Components:
  - Row 1: `[⬅ Back to <Category>]` (customId `help:cat:<categoryId>:<page>` using the values threaded through from the entry customId) + `[⬅ Overview]`.
- Entry from `/help category:<id>` (where the user skipped the category page) defaults `page` to `0`, which is the correct Level 1 page for that case too.

### Direct entry

`/help` takes one optional option:

- `category: string` — autocomplete-populated from the registered categories.

If provided and valid, render skips straight to the Level 1 page for that category. If provided but unknown (rare, since autocomplete prevents typos), fall back to Overview with a note prepended to the embed description: "Couldn't find category `xyz` — here's the full list."

---

## Permission markers

Read `command.options.preconditions` statically at collect time and map known precondition names to icons:

| Precondition | Marker |
|---|---|
| `IsModerator` | 🛡️ |
| `IsAdmin` | ⚙️ |
| `IsDJ` | 🎧 |

Commands with multiple markers show all. No DB calls or live precondition evaluation at render time — markers reflect the statically configured preconditions, which is good enough for discovery.

---

## Collect-time behavior

`collect.ts` exposes:

```ts
interface HelpSnapshot {
  categories: CategoryMeta[];
  commandsByCategory: Map<string, CollectedCommand[]>;
  commandByName: Map<string, CollectedCommand>;
}

interface CollectedCommand {
  name: string;
  categoryId: string;
  help: CommandHelp;          // real metadata or fallback
  markers: string[];          // e.g. ["🛡️"]
  isFallback: boolean;        // true when help field was missing
}

function getHelpSnapshot(): HelpSnapshot;
```

- Walks `container.stores.get("commands")` on first call after ready, caches the snapshot for the process lifetime. Sapphire's store is stable during a process, so re-walking per interaction is wasteful.
- For each command, resolves its category from `command.location.directories` (the category directory name).
- Category order on the overview is the fixed order in `categories.ts` — not derived from directory listing — so it's stable and curated.

---

## Edge cases & error handling

**Missing `help` on a command.** Since this spec ships with `help` populated for every existing command, missing `help` should not occur in the merged state. The fallback still exists for future commands added without updating help:

- `summary` = `command.description` if present, otherwise `"(no description)"`.
- `examples` = `[]`. Detail page shows "No examples yet."
- `isFallback` flag logged at `debug` level on snapshot build so it's visible but not noisy.

**Unknown category in `/help category:<id>`.** Autocomplete prevents typos; if a string is forced through, render Overview with a prepended note (see UI flow).

**Unknown command name in a button/select customId.** Happens if a user clicks a button on a message from before a restart/deploy where a command was renamed or removed. Fall back to Overview with the same prepended note.

**Stale ephemeral messages after restart.** Ephemeral messages cannot be edited once the interaction token expires. Handlers will `catch` edit/update failures and silently ignore, matching the error-swallowing pattern used in `mentionResponder.ts` and other listeners.

**Button ownership.** Ephemeral replies are only visible to the invoker, so no `CollectorFilter` / user-ID check is required in the handlers.

---

## Out of scope

Explicitly not in this spec — each would be a separate future effort:

- Localization / i18n of help strings.
- Free-text search ("find a command that…").
- Exporting help to a generated website or README.
- Telemetry on which commands users look up.
- Per-guild help customization.

---

## Rollout

**Single PR.** Ships:

1. New files listed in the Architecture section.
2. `help` metadata populated for every existing command (~55 small edits to `super()` calls).
3. Interaction handlers wired up under the `help:` prefix.

Diff will be wide but shallow — almost entirely additive. No database migrations, no external service dependencies, no changes to existing preconditions or stores.

---

## Testing

No test harness exists in the repo yet. Manual verification covers:

- `/help` with no argument renders Overview; every category is clickable via the selector.
- `/help category:rpg` jumps straight to the RPG category page.
- `/help category:doesnotexist` (via raw interaction) falls back to Overview with a note.
- Category selector navigates to category page.
- Prev/Next buttons paginate correctly on RPG (9 commands → 2 pages at threshold 8); disabled at bounds.
- Command selector on category page opens command detail.
- Command detail shows examples and per-subcommand examples for `/shop`.
- Permission markers appear for `/ban` (🛡️), `/config` (⚙️), `/play` (🎧).
- Back-to-category returns to the correct page of the correct category.
- Overview button works from both Level 1 and Level 2.
- Clicking an old help button after a restart produces no unhandled error.
