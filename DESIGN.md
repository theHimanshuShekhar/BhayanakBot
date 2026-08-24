---
name: BhayanakBot
description: Poster-brutalist dark UI for a Discord bot's public face — gig-poster ink on void black, with loving Discord-client mimicry
colors:
  void-black: "#0a0a0f"
  panel-black: "#0e0e16"
  panel-raised: "#13131c"
  hairline-border: "#1a1a24"
  paper-white: "#f5f5f0"
  voltage-violet: "#a78bfa"
  hazard-yellow: "#facc15"
  signal-green: "#22c55e"
  alarm-red: "#ef4444"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "128px"
    fontWeight: 900
    lineHeight: 0.88
    letterSpacing: "-4px"
  headline:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "64px"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-2px"
  title:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-1px"
  body:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.5px"
rounded:
  none: "0px"
  xs: "3px"
  sm: "6px"
  md: "10px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.voltage-violet}"
    textColor: "{colors.void-black}"
    rounded: "{rounded.none}"
    padding: "18px 28px"
  button-primary-nav:
    backgroundColor: "{colors.voltage-violet}"
    textColor: "{colors.void-black}"
    rounded: "{rounded.none}"
    padding: "10px 18px"
  button-ghost:
    backgroundColor: "transparent"
    rounded: "{rounded.none}"
    padding: "18px 28px"
  sticker-tag:
    backgroundColor: "{colors.hazard-yellow}"
    textColor: "{colors.void-black}"
    padding: "4px 12px"
  card-panel:
    backgroundColor: "{colors.panel-black}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
    padding: "24px"
---

# Design System: BhayanakBot

## Overview

**Creative North Star: "The Basement Gig Poster"**

This site looks like a flyer stapled to a black venue wall: enormous slugged uppercase type, stickers slapped on at angles, hard ink shadows instead of blur, and a two-color ink set (violet + hazard yellow) over near-black stock. Nothing floats; everything is printed, bordered, and physically pressable. The irreverence of the product voice ("your server's worst behavior, automated") is carried entirely by typography and stickers — never by illustration clutter or gradient washes.

The second half of the identity is **Discord-native mimicry**: fake chat windows (`SceneCard`), message rows, bot embeds, and the violet-glow bot avatar reproduce the client the product lives in. On the home surface, those replicas become a wall of six flyers: the wall gets pasted up on first view — flyers slam into place in a capped stagger (90ms apart, 360ms each), each settling from an over-tilted lift into its rest rotation — and each hangs at a slight rotation (−1.25° to +1.25°) over a solid 6px ink shadow until hover, when it straightens flat while pressing 3px into its own shadow footprint. These mockups are the site's imagery — real product texture standing in for screenshots.

Depth is tonal, not atmospheric: three stacked surface blacks separated by 2px borders, plus hard offset shadows that compress when pressed.

**Key Characteristics:**
- Gig-poster display type: Space Grotesk Black, uppercase, tight negative tracking, leading under 1
- JetBrains Mono micro-labels as the flyer's fine print (nav, buttons, tags, stats captions)
- Square chrome: zero border-radius on every container, button, and panel
- Hard offset press-shadows that translate-and-compress on hover/active; no soft drop shadows anywhere
- Violet as the single working accent; hazard yellow reserved for rotated sticker slams
- Discord UI replicas (channel windows, messages, embeds) used as authentic imagery
- Flyer-wall signature: Discord feature cards slam into place in a staggered paste-up on first view, hang slightly rotated at rest, and straighten flat on hover
- Honest state board: active systems use solid cards; provider-dependent systems use dashed conditional cards

## Colors

A two-ink poster palette on layered black stock: violet does the work, yellow slams the accents, status colors report state.

### Primary
- **Voltage Violet** (#a78bfa): the working accent — primary CTAs, active nav links and tabs, command names in code, stat emphasis, the BOT badge, category rules under headings. Electric enough to read as neon against the black stack without glowing.

### Secondary
- **Hazard Yellow** (#facc15): the sticker ink — rotated `Sticker` tags ("NO ADS · NO PAYWALL", "STEP 1"), mac traffic-light dots, live-status warning dot. Small slams only; it is also the literal value of `--color-warning`.

### Tertiary
- **Signal Green** (#22c55e): success/live state — the homepage hero status dot's pulse glow, "FULL DOCS" markers, and enabled-system markers on the status board.
- **Alarm Red** (#ef4444): decorative only so far — first mac traffic light. Do not promote it to error semantics casually; the system currently has no destructive-flow styling.

### Neutral
- **Void Black** (#0a0a0f): page background; text color on accent/yellow surfaces.
- **Panel Black** (#0e0e16): resting card/panel/footer background.
- **Panel Raised** (#13131c): hover-elevated surface and window title bars.
- **Hairline Border** (#1a1a24): every structural edge; the 2px grid that organizes all chrome.
- **Paper White** (#f5f5f0): warm off-white foreground; also the hard-shadow ink and focus-ring color. Opacity steps (/90 /85 /75 /70 /65 /60 /55 /50) create the text hierarchy instead of gray tokens; /50 is the legibility floor — anything fainter is decorative only (ghost numerals at /10).

### Named Rules
**The Sticker Rule.** Hazard yellow appears only as a small physical slam — a rotated tag, a dot — never as a wash, background field, or text color on dark.

**The One Ink Rule.** Voltage violet is the only accent allowed to carry interactive weight (links, tabs, CTAs, code). A screen stays ≥90% monochrome ink; its rarity is the point.

## Typography

**Display Font:** Space Grotesk (with system-ui fallback) — weights 400–900 loaded
**Label/Mono Font:** JetBrains Mono (with ui-monospace fallback) — weights 400–800 loaded

**Character:** A shout and a whisper. Space Grotesk Black screams the headline at near-zero leading; JetBrains Mono mutters the metadata underneath. No serif, no second humanist — the pairing is deliberate poster economy.

### Hierarchy
- **Display** (900, 128px desktop / 56px mobile, line-height 0.88, −4px tracking, uppercase): hero only, one per site, always with an accent-colored middle line.
- **Headline** (900, 64–80px desktop / 40–48px mobile, line-height 0.9–0.95, −2 to −3px tracking, uppercase): page H1s; setup uses 80px, docs pages 64px. Always paired with a mono breadcrumb above (`docs / commands`).
- **Section Title** (900, 28px, uppercase, −0.5px tracking): category headers, followed inline by a violet rule bar (flex-1, opacity 40%).
- **Title** (900, 36px desktop / 26px mobile, −1px tracking): stat-strip numerals.
- **Body** (400–500, 13–18px, line-height 1.5–1.6): Space Grotesk everywhere prose appears; muted via fg opacity (60–70%) for supporting copy.
- **Label** (mono 700–800, 10–13px, letter-spacing 0.5–1px; uppercase where the copy calls for it): buttons, tags, breadcrumbs, table keys, kbd hints, and captions. Navigation links stay mono but use lowercase labels; sentence-case mono at 11–12px serves secondary metadata (timestamps, counts).

### Named Rules
**The Two Voices Rule.** Space Grotesk speaks, JetBrains Mono annotates. Never set paragraphs or descriptions in mono; never set buttons or labels in the display face.

## Layout

The spatial model is a centered 1180px container with 32px side padding (20px mobile), with a two-column flyer wall for feature breadth that collapses to one column below the md breakpoint. Sections breathe on an approximately 80px vertical rhythm (homepage 96px, status 80px; mobile 56px or 48px), tightened inside panels to 16–24px. Responsive behavior centers on md (768px): below it, multi-column grids collapse (4→2 or 3→1), the flyer wall stacks, and the nav swaps links for a burger sheet. Local density refinements also use sm (640px) and lg (1024px).
Structural edges are drawn, not implied: 2px borders divide the nav, split sibling cards into shared grids (border-r/border-b choreography), and band the stat strip top and bottom. Docs pages split into a sticky 264px sidebar (desktop) / horizontal scroll chip row (mobile) beside a content column, both pinned under the sticky 53px nav.

Density: poster-scale emptiness around acts, console-density fine print inside them.

### Named Rules
**The Flyer Rule.** Show product breadth as a wall of real feature flyers that can be read in place; do not fall back to a generic screenshot hero.

## Elevation & Depth

Flat-by-default with tonal stacking. There are no soft drop shadows in the entire system; depth reads through three surface blacks (Void → Panel → Panel Raised) separated by Hairline borders. Elevation events are mechanical: hard offset shadows in solid Paper White ink that compress on interaction.

### Shadow Vocabulary
- **Press rest** (`5px 5px 0 var(--color-fg)`): hero-scale CTAs and Sticker tags at rest (`3px 3px` variant for smaller elements).
- **Press hover** (`3px 3px 0`): element translates +2px,+2px toward its shadow; brightness lifts ~8%.
- **Press hover compact** (`1.5px 1.5px 0`): nav CTA variant before it lands flat.
- **Press active** (`0 0 0`): element lands flat — fully translated onto the shadow footprint.

### Named Rules
**The No-Blur Rule.** If a shadow has blur or transparency, it is wrong. Shadows are solid ink offsets; atmosphere comes from the radial dot-grid backdrop mask, never from elevation.

## Shapes

Square chrome, round inhabitants. Every container, button, tab, input wrapper, and section boundary has zero radius and a 2px Hairline border. Radius survives only inside the Discord-mimicry layer where the real client demands it: full-circle avatars and dots, 10px reaction pills, 6px embed right-corners, 3px BOT badge. Focus indication is a 2px solid Paper White outline, offset 3px, on a 2px-radius box — visible on every interactive element including inputs.

## Components

### Buttons
- **Shape:** square (0px), 2px border; mono 12–14px extrabold uppercase, 0.5px tracking
- **Primary:** Voltage Violet fill, Void Black text (`+ Add to Discord`); carries the press shadow vocabulary — rests at 5px/5px (hero) or 3px/3px (nav), translates into the shadow on hover, lands flat on active
- **Ghost:** 2px Paper White outline on transparent; fills with 8% white on hover
- **Tabs:** square 2px-bordered toggles; active = violet fill + black text, inactive = transparent + white text; squeeze-scales to 0.97 on active click

### Stickers
- **Style:** Hazard Yellow fill, Void Black mono extrabold uppercase text, 2px Void Black border, solid 3px offset shadow in Void Black, rotated −6° to +6° (props: rot/bg/color/size)
- **Role:** physical slams on posters and step markers; also recolored per SceneCard tag

### Cards / Containers
- **Corner Style:** square (0px), always inside a shared 2px-border grid with siblings
- **Background:** Panel Black at rest, Panel Raised on `.a-card-lift` hover (−2px translateY, violet underline wipes in from left)
- **Shadow Strategy:** none — see Elevation
- **Internal Padding:** 20–28px cards, 32–40px feature panels

### Inputs / Fields
- **Style:** terminal prompt — transparent mono input inside a 2px-bordered Panel Black strip, violet `>` glyph prefix, ⌘K kbd hint right
- **Focus:** outline ring per Shapes; the strip itself never changes fill

### Navigation
- Sticky top bar, 2px bottom border, Void Black; logo wordmark in Display Black with violet "Bot" suffix and the favicon's violet B mark as the durable square identity asset; mono lowercase links with underline bars that wipe from center (55% width on hover, 100% active, violet when active); primary CTA rides right as a compact press button. Mobile collapses to a burger (three 2px bars) opening a bordered sheet that drops in with a 220ms snap.

### Signature Component: The Discord Window (SceneCard + ChatMessage + BotEmbed + BotAvatar)
Fake channel window titled `# channel-name` in mono with a recolored sticker tag, containing real message rows: circular avatars (users get accent-colored initial discs; the bot gets the violet-glow face mark — a near-black disc carrying a violet radial glow and two tilted eyes), bold names, mono timestamps, reaction pills tinted 15% violet, and embeds as left-accent-bordered quote blocks (4px violet spine, 4%-white body). This family is the site's product photography — build new feature showcases from it before inventing any other imagery.

### Flyer Wall Cards
- **Shape:** Discord `SceneCard` windows remain square, 2px bordered, and Panel Black; the surrounding flyer hangs at −1.25°, +0.75°, or +1.25° at rest.
- **Interaction:** The wall pastes up on first view — flyers slam in with a 90ms stagger (360ms each, transform/opacity only, runs once via an IntersectionObserver; no JS leaves them visible). At rest each sits on a solid 6px Paper White offset shadow. On hover the flyer straightens to 0°, presses 3px into its footprint, and the shadow compresses to 3px with a slight brightness lift (1.05); reduced-motion users get no entrance animation and no transform, keeping the shadow response only.
- **Content:** Use real product scenes (messages, embeds, statuses) as the imagery; keep the surrounding pitch and doc link in Space Grotesk and mono respectively.

### Setup Step Markers
- **Shape:** Two-column bordered Panel Black cards collapse to one column on mobile; the top row pairs a level `STEP n` sticker with a right-aligned two-digit display numeral.
- **Treatment:** The numerals are intentionally ghosted at Paper White / 10% opacity, preserving the hierarchy of the sticker and instruction copy.

### Status State Cards
- **Active:** Panel Black with a 2px border, a small solid Signal Green square marker, and an "enabled" mono suffix — an enabled-capability marker, not a liveness claim; the only pulsing dot in the system is the homepage hero status indicator.
- **Conditional:** Void Black/transparent fill with the same 2px border rendered dashed, a Hazard Yellow square marker, and a mono note explaining the provider/configuration requirement.

### Identity Mark
- **Favicon:** `web/public/favicon.svg` is a Void Black square carrying a geometric Voltage Violet capital B; use it as the compact mark, while the wordmark remains the primary navigation lockup.
- **Bot avatar:** the bot's face wherever it speaks in mockups — a near-black disc (lab(3.56% 0 0)) carrying a violet radial glow (#d3c1fc → #a27df8 → #8b5cf6 → #573b98, lit from the upper left) and two slightly tilted near-black eyes, with no surrounding ring. Every instance watches the pointer: each eye is its own tracked group with a depth factor (near 1.0, far 0.85), translating toward the cursor with a size-dependent gain — 24% of avatar width for small instances easing to 11% at hero scale (320px+), with tilt 8°→4° and squash 8%→5% on the same curve, saturating at 320px cursor distance and easing per eye over 320ms expo-out — disabled under reduced motion.

### Code Blocks
Mac-window pastiche: Panel Black shell, Panel Raised title bar with red/yellow/green traffic dots and mono filename, 12px/1.7 mono content at 75% white.

## Do's and Don'ts

### Do:
- **Do** keep every interactive element mechanically pressable: hard shadow, translate-on-hover, flat-on-active.
- **Do** set buttons, tags, captions, keys, and navigation in JetBrains Mono; use uppercase treatment only where the copy calls for it.
- **Do** draw structure with 2px Hairline borders — shared grids, banded strips, divided stacks.
- **Do** showcase features through the Discord-mimicry component family before reaching for abstract graphics.
- **Do** mute supporting copy with fg opacity steps (50–70%) rather than introducing gray tokens.
- **Do** reserve dashed transparent cards for states that are conditional on configuration or an external provider.

### Don't:
- **Don't** use blurred or translucent shadows; elevation is solid-offset ink only (No-Blur Rule).
- **Don't** round container, button, or panel corners — radius belongs to avatars, pills, badges, and embeds alone.
- **Don't** spread Hazard Yellow beyond small slams, or use Signal Green/Alarm Red as interactive accents; those hues report state or traffic only.
- **Don't** add gradients beyond the sanctioned bot-avatar violet radial and the hero dot-grid mask.
- **Don't** set body copy or long strings in JetBrains Mono, and don't set UI labels in Space Grotesk.
