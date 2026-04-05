# YouTube & Spotify Music Support

**Date:** 2026-04-05
**Status:** Approved

## Problem

The bot uses `discord-player` v7 with `DefaultExtractors`, which includes `YoutubeExtractor` and `SpotifyExtractor`. However, neither works because the required bridge libraries (`youtube-ext` for YouTube, `play-dl` for Spotify) are not installed. Additionally, playlist responses are indistinguishable from single-track responses.

## Goals

- YouTube links, YouTube playlist links, and YouTube search queries work
- Spotify track and playlist links work
- When a playlist is queued, show a rich embed with playlist name, track count, and first 5 tracks
- Single track responses remain as-is (plain text)

## Out of Scope

- Spotify search queries (Spotify requires OAuth; `play-dl` resolves Spotify URLs by bridging to YouTube)
- Per-channel source restrictions
- Different embed styles per source

## Design

### Dependencies

Install two packages as runtime dependencies:

| Package | Purpose |
|---|---|
| `youtube-ext` | Bridge library for `YoutubeExtractor` in `@discord-player/extractor` |
| `play-dl` | Bridge library for `SpotifyExtractor` in `@discord-player/extractor` |

No changes to extractor registration — `DefaultExtractors` already registers both extractors in `src/index.ts`. The bridge libraries just need to be present in `node_modules`.

### `src/commands/music/play.ts` changes

`player.play()` returns `{ track, queue, searchResult }`. When a playlist URL is passed, `searchResult.playlist` is populated with the full playlist object and `searchResult.tracks` contains all queued tracks.

**Detection logic:**

```
if searchResult.playlist exists
  → reply with playlist embed
else
  → reply with existing plain-text message (no change)
```

**Playlist embed fields:**

| Field | Value |
|---|---|
| Title | `searchResult.playlist.title` (linked to original URL) |
| Color | `0xFF0000` (YouTube red) or `0x1DB954` (Spotify green) |
| Description | First 5 tracks from `searchResult.tracks` listed as `1. Title — Author` |
| Footer | `Queued by <username>` · `X tracks` |

Source is detected from the query string — if it contains `open.spotify.com` it's Spotify, otherwise YouTube.

### Data flow

```
/play <query or URL>
  → player.play(voiceChannel, query, nodeOptions)
  → discord-player checks each registered extractor's validate()
  → YoutubeExtractor handles youtube.com / youtu.be / plain search queries
  → SpotifyExtractor handles open.spotify.com URLs (bridges to YouTube via play-dl)
  → returns { track, queue, searchResult }
  → searchResult.playlist? → embed reply : plain-text reply
```

### Error handling

No changes — existing try/catch in `play.ts` already catches and reports failures from `player.play()`. Library-level errors (e.g. rate limits, private videos) surface through this path.

## Files Changed

| File | Change |
|---|---|
| `package.json` | Add `youtube-ext` and `play-dl` dependencies |
| `pnpm-lock.yaml` | Updated by pnpm |
| `src/commands/music/play.ts` | Add playlist embed response branch |
