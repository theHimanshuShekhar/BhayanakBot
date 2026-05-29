# Rich Command Docs Design

**Goal:** Add rich MDX documentation pages for every current Discord command shown in the web app.

**Scope:** The web app currently renders rich command pages from `web/src/content/commands/*.mdx` and falls back to catalog-only pages from `web/src/data/commands.ts`. This work removes the catalog-only fallback state for current commands by adding one MDX file per command slug and correcting catalog metadata where it does not match implementation.

**Approach:** Use category-tailored rich pages. Simple commands get compact frontmatter-only pages with accurate syntax, one realistic example, and related commands. Complex commands get the same structured frontmatter plus short body copy covering permissions, limits, cooldowns, or operational behavior when the command implementation warrants it.

**Source Of Truth:** All command names, option names, subcommands, examples, limits, permissions, and behavioral notes must come from `src/commands/**` and supporting implementation files. Existing catalog entries and existing MDX pages may be reused only after checking them against code.

**Files:**

- `web/src/content/commands/*.mdx`: add missing rich pages and correct existing pages.
- `web/src/data/commands.ts`: correct command names, descriptions, examples, subcommands, and usage notes so catalog data stays aligned with the MDX pages and code.
- `web/src/pages/commands/[slug].astro`: no renderer change is expected unless validation shows the existing schema cannot represent current command behavior.
- `web/src/content.config.ts`: no schema change is expected; keep the existing rich-doc shape unless a command cannot be represented accurately.

**Required Corrections Already Identified:**

- `/music` is the actual controls command name, not `/controls`.
- `/reactionrole` is the actual reaction role command name, not `/reaction-roles`.
- `/rolemenu` is the actual role menu command name, not `/role-menu`.
- Several catalog examples need option-name corrections, including `/inventory use item:...`, `/pet adopt`, `/property view`, `/poll option1/option2`, `/ticket open subject:...`, and `/suggestion deny reason:...`.
- Some behavior notes should be documented, including mute role configuration, purge filtering and 14-day bulk delete limits, summarize time choices and cooldown, Guess Who mention-based guessing, and admin-only management commands.

**Validation:**

- Programmatically compare `COMMANDS` slugs against `web/src/content/commands/*.mdx` and confirm there are no missing rich docs for current commands.
- Run `pnpm web:build` to validate Astro content collection schema and page generation.
- Run `pnpm check` if TypeScript or MDX formatting changes require repository formatting/lint validation.

**Out Of Scope:**

- No bot command behavior changes.
- No redesign of the command page UI.
- No new command catalog generation system.
- No documentation for commands not present in the current source tree.
