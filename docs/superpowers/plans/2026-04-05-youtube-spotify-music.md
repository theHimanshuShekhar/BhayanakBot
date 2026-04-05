# YouTube & Spotify Music Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `youtube-ext` and `play-dl` bridge libraries so YouTube and Spotify links work, and show a rich embed when a playlist is queued.

**Architecture:** `discord-player`'s `DefaultExtractors` already registers `YoutubeExtractor` and `SpotifyExtractor` — they just need their bridge libraries installed. `play.ts` is updated to check `searchResult.hasPlaylist()` on the result of `player.play()` and reply with an embed instead of plain text for playlists.

**Tech Stack:** discord-player v7, @discord-player/extractor, youtube-ext, play-dl, discord.js EmbedBuilder

---

## File Map

| File | Change |
|---|---|
| `package.json` | Add `youtube-ext` and `play-dl` as dependencies |
| `pnpm-lock.yaml` | Auto-updated by pnpm |
| `src/commands/music/play.ts` | Destructure `searchResult` from `player.play()`, add playlist embed branch |

---

### Task 1: Install bridge libraries

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install youtube-ext and play-dl**

```bash
pnpm add youtube-ext play-dl
```

Expected output: two new entries appear in `package.json` `dependencies` and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Verify they resolve**

```bash
node -e "require('youtube-ext'); require('play-dl'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add youtube-ext and play-dl bridge libraries"
```

---

### Task 2: Add playlist embed to /play command

**Files:**
- Modify: `src/commands/music/play.ts`

- [ ] **Step 1: Update the import line to add EmbedBuilder**

In `src/commands/music/play.ts`, change:

```ts
import { Command } from "@sapphire/framework";
import { GuildMember } from "discord.js";
import { useMainPlayer } from "discord-player";
```

to:

```ts
import { Command } from "@sapphire/framework";
import { EmbedBuilder, GuildMember } from "discord.js";
import { useMainPlayer } from "discord-player";
```

- [ ] **Step 2: Replace the chatInputRun method body**

Replace the entire `chatInputRun` method with the following. The only change is inside the `try` block: destructure `searchResult` from `player.play()`, and branch on `searchResult.hasPlaylist()`.

```ts
public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
	const member = interaction.member as GuildMember;
	const voiceChannel = member.voice.channel;

	if (!voiceChannel) {
		return interaction.reply({ content: "You need to be in a voice channel to play music.", ephemeral: true });
	}

	const query = interaction.options.getString("query", true);
	const player = useMainPlayer();

	await interaction.deferReply();

	try {
		const { track, searchResult } = await player.play(voiceChannel, query, {
			nodeOptions: {
				metadata: {
					channel: interaction.channel,
					requestedBy: interaction.user,
				},
				selfDeaf: true,
				volume: 80,
				leaveOnEmpty: true,
				leaveOnEmptyCooldown: 30_000,
				leaveOnEnd: true,
				leaveOnEndCooldown: 30_000,
			},
			requestedBy: interaction.user,
		});

		if (searchResult.hasPlaylist() && searchResult.playlist) {
			const playlist = searchResult.playlist;
			const tracks = searchResult.tracks;
			const isSpotify = query.includes("open.spotify.com");
			const color = isSpotify ? 0x1db954 : 0xff0000;

			const trackList = tracks
				.slice(0, 5)
				.map((t, i) => `${i + 1}. **${t.title}** — ${t.author}`)
				.join("\n");

			const embed = new EmbedBuilder()
				.setColor(color)
				.setTitle(playlist.title)
				.setURL(playlist.url || null)
				.setDescription(trackList)
				.setFooter({
					text: `Queued by ${interaction.user.username} · ${tracks.length} tracks`,
				});

			return interaction.editReply({ embeds: [embed] });
		}

		return interaction.editReply({ content: `Queued: **${track.title}** by **${track.author}**` });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return interaction.editReply({ content: `Failed to play: ${message}` });
	}
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
pnpm build
```

Expected: no errors, `dist/` updated.

- [ ] **Step 4: Manual smoke test**

Start the bot:

```bash
pnpm dev
```

Test these three cases in Discord:

| Input | Expected response |
|---|---|
| `/play never gonna give you up` | Plain text: `Queued: Never Gonna Give You Up by Rick Astley` |
| `/play https://www.youtube.com/watch?v=dQw4w9WgXcQ` | Plain text: `Queued: Never Gonna Give You Up by Rick Astley` |
| `/play https://www.youtube.com/playlist?list=<any public playlist>` | Embed with playlist name, first 5 tracks, footer with track count |
| `/play https://open.spotify.com/playlist/<id>` | Embed with green color, playlist name, first 5 tracks |

- [ ] **Step 5: Commit**

```bash
git add src/commands/music/play.ts
git commit -m "feat: show playlist embed when queuing YouTube or Spotify playlist"
```
