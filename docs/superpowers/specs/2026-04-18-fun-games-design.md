# Fun & Games Feature Design

**Date:** 2026-04-18  
**Scope:** 17 channel-based games, 4 social action commands, 10 simple fun/utility commands

---

## Overview

Add a games system and expanded fun commands to BhayanakBot. Games use a shared engine for session management and reward winners with coins/XP from the existing RPG economy. Social and fun commands are stateless with no rewards.

---

## Architecture

### Game Engine — `src/lib/games/`

```
src/lib/games/
  session.ts    — GameSession type + in-memory Map<channelId, GameSession>
  reward.ts     — rewardWinner(userId, guildId, coins, xp)
  index.ts      — re-exports
```

**GameSession type:**
```ts
type GameSession = {
  gameId: string
  hostId: string
  channelId: string
  guildId: string
  state: unknown        // game-specific data
  startedAt: number
  timeout: NodeJS.Timeout
}
```

**Engine rules:**
- One active session per channel at a time. Starting a second game returns an ephemeral error embed.
- Sessions auto-expire after 60 seconds of inactivity (game-specific timeout can override).
- On win or expiry, session is removed and `rewardWinner()` is called (or skipped on timeout with no winner).

**`rewardWinner(userId, guildId, coins, xp)`:**
- Calls `getOrCreateProfile(userId, guildId)` to ensure profile exists.
- Calls `addCoins(userId, guildId, coins)` and `addXpToProfile(userId, guildId, xp)` from `src/db/queries/rpg.ts`.

### Directory Layout

```
src/commands/games/        — 17 game commands (new category)
src/commands/fun/          — existing + 4 social + 10 fun commands
src/lib/games/             — shared engine
```

---

## Games (17 total)

All games are channel-based: anyone in the channel can answer/participate. The first correct answer (or highest score at end) wins coins and XP.

### Coin & XP Rewards

| Game | Coins | XP |
|---|---|---|
| `/trivia` | 80 | 20 |
| `/riddle` | 80 | 20 |
| `/emojidecode` | 80 | 20 |
| `/hangman` | 100 | 25 |
| `/wordguess` | 100 | 25 |
| `/anagram` | 100 | 25 |
| `/typerace` | 60 | 15 |
| `/fastdraw` | 60 | 15 |
| `/mathrace` | 70 | 20 |
| `/guessthenumber` | 90 | 25 |
| `/guessthepokemon` | 90 | 25 |
| `/wordchain` | 120 | 30 |
| `/quiz` | 150 | 40 |
| `/trueorfalse` | 150 | 40 |
| `/wouldyourather` | 0 | 0 |
| `/rickandmorty` | 80 | 20 |
| `/harrypotter` | 80 | 20 |

### Game Descriptions

**Knowledge / First-to-answer:**
- `/trivia` — Fetches a question from Open Trivia DB API. First player to type the correct answer wins.
- `/riddle` — Posts a riddle from a local pool (`src/data/riddles.ts`, 20+ riddles). First to answer correctly wins.
- `/emojidecode` — Posts a sequence of emojis representing a movie/phrase from a local pool (`src/data/emojiPuzzles.ts`, 30+ puzzles). First to guess wins.
- `/rickandmorty` — Random trivia about Rick & Morty characters/episodes via the Rick & Morty API. First correct answer wins.
- `/harrypotter` — Random trivia about HP spells/characters/houses via the HP API. First correct answer wins.

**Word games:**
- `/hangman` — Bot picks a random word. Players guess one letter at a time via message. Wrong guesses fill the hangman. 6 wrong guesses = game over.
- `/wordguess` — Wordle-style. Players guess a 5-letter word in up to 6 attempts. Bot responds with color-coded feedback (correct/misplaced/wrong). Reward = 100 base coins + 20 per remaining attempt (max 200 coins for solving on attempt 1).
- `/anagram` — Bot posts a jumbled word. First to unscramble and type it correctly wins.

**Speed:**
- `/typerace` — Bot posts a sentence. Players race to type it exactly. Fastest typist wins.
- `/fastdraw` — Bot counts down 3-2-1 then posts "DRAW!". Players race to type a trigger word. Fastest wins.
- `/mathrace` — Bot posts a math equation (difficulty: easy/medium/hard parameter). First correct answer wins.

**Guessing:**
- `/guessthenumber` — Bot picks 1–100. Bot replies higher/lower to each guess. First player to type the exact number wins (multiplayer). In solo play, the session ends when the number is found and the player is rewarded.
- `/guessthepokemon` — Bot posts a Pokemon's silhouette description (name only, no image). First to name it wins. Uses PokeAPI.

**Turn-based / Multi-round:**
- `/wordchain` — Players say words starting with the last letter of the previous accepted word (no enforced turn order — anyone can respond). The bot tracks eliminated players (wrong/repeat word) and ignores their subsequent messages. Last non-eliminated player to contribute wins; if only one player remains after others are eliminated, that player wins.
- `/quiz` — 5-round trivia match using Open Trivia DB. Each round scores points. Highest score at the end wins.
- `/trueorfalse` — 5-round rapid-fire true/false questions. Highest score wins.

**Social voting:**
- `/wouldyourather` — Bot posts two options. Channel votes with reactions. No winner, no reward — pure engagement.

---

## Social Action Commands (4)

Located in `src/commands/fun/`. No session, no rewards. Use `nekos.best` API for GIFs.

| Command | Behavior |
|---|---|
| `/hug @user` | Sends a hug GIF embed mentioning both users |
| `/slap @user` | Sends a slap GIF embed |
| `/pat @user` | Sends a pat GIF embed |
| `/ship @user1 @user2` | Deterministic compatibility % (hash of both user IDs), fun embed with a generated ship name |

**GIF fallback:** If `nekos.best` is unreachable, use a small local pool of static GIF URLs per action type.

---

## Simple Fun Commands (10)

Located in `src/commands/fun/`. Stateless, no rewards.

| Command | API | Behavior |
|---|---|---|
| `/joke [type]` | JokeAPI | Returns a joke. Type options: programming, general, dark |
| `/dadjoke` | icanhazdadjoke | Returns a random dad joke |
| `/advice` | Advice Slip API | Returns a random piece of advice |
| `/numberfact [number]` | Numbers API | Returns an interesting fact about the number |
| `/quote` | Quotable API | Returns an inspirational quote with author |
| `/dog` | Dog CEO API | Returns a random dog image embed |
| `/cat` | The Cat API | Returns a random cat image embed |
| `/apod` | NASA APOD API (free key) | Returns NASA's Astronomy Picture of the Day with description |
| `/weather [city]` | wttr.in | Returns current weather for a city as a formatted embed |
| `/define [word]` | Free Dictionary API | Returns definition, phonetics, and example usage |

**NASA APOD** requires a free API key stored as `NASA_API_KEY` env var (falls back to `DEMO_KEY` which allows 30 req/hour).

---

## Error Handling

| Scenario | Response |
|---|---|
| Channel already has active game | Ephemeral embed: "A **{game}** is already running in this channel." |
| Game times out with no winner | Public message: "Time's up! No one won." Session cleared. |
| RPG profile missing for winner | `getOrCreateProfile()` called before rewarding |
| External API failure (trivia, pokemon, etc.) | Fallback to local question pools; error embed if no fallback available |
| `/weather` city not found | Ephemeral embed: "City not found." |
| `/define` word not found | Ephemeral embed: "No definition found for **{word}**." |
| Self-targeting social commands (`/hug @self`) | Ephemeral embed: "You can't do that to yourself." |

---

## External APIs Summary

| API | Base URL | Auth |
|---|---|---|
| Open Trivia DB | `https://opentdb.com/api.php` | None |
| PokeAPI | `https://pokeapi.co/api/v2/` | None |
| Rick & Morty API | `https://rickandmortyapi.com/api/` | None |
| Harry Potter API | `https://hp-api.onrender.com/api/` | None |
| nekos.best | `https://nekos.best/api/v2/` | None |
| JokeAPI | `https://v2.jokeapi.dev/joke/` | None |
| icanhazdadjoke | `https://icanhazdadjoke.com/` | None |
| Advice Slip | `https://api.adviceslip.com/advice` | None |
| Numbers API | `http://numbersapi.com/` | None |
| Quotable API | `https://api.quotable.io/random` | None |
| Dog CEO API | `https://dog.ceo/api/breeds/image/random` | None |
| The Cat API | `https://api.thecatapi.com/v1/images/search` | None (free tier) |
| NASA APOD | `https://api.nasa.gov/planetary/apod` | Free key (`NASA_API_KEY`) |
| wttr.in | `https://wttr.in/{city}?format=j1` | None |
| Free Dictionary API | `https://api.dictionaryapi.dev/api/v2/entries/en/` | None |

---

## Environment Variables

Add to `.env` and `docker-compose.yml`:

```
NASA_API_KEY=DEMO_KEY   # replace with free key from api.nasa.gov
```
