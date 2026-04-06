# Random Channel Responder — Design Spec

**Date:** 2026-04-06

## Context

The bot should occasionally chime into a specific Discord channel with a funny or dark-humored reply, as if it's a lurking member of the chat. The response should feel contextually aware (reads last 20 messages), tonally varied (random personality + format), and probabilistically natural (not exactly every 100th message).

## Feature Summary

When a human sends a message in channel `199168135935295488`, the bot rolls a variable chance (~1% average) to respond. If it wins the roll, it reads the last 20 messages, picks a random personality and response format, generates a reply via Ollama, and sends it. If Ollama fails or times out, the turn is silently skipped — no hardcoded fallback.

---

## Implementation

### New file: `src/listeners/messages/randomResponder.ts`

A Sapphire `Listener` on `Events.MessageCreate`. Sapphire auto-discovers it — no manual registration needed.

### Logic flow

```
messageCreate fired
  └─ skip if: author is bot, channel id !== TARGET_CHANNEL_ID
  └─ roll: Math.random() < Math.random() * 0.02  (averages 1%, varies naturally)
       └─ no  → return (silent skip)
       └─ yes → channel.sendTyping()
              → fetch last 20 messages (channel.messages.fetch({ limit: 20 }))
              → pick random personality from PERSONALITIES[]
              → pick random format from FORMATS[]
              → build system prompt: personality + format instructions
              → build user prompt: formatted chat log (Username: message, newest last)
              → callOllama(system, userPrompt, 60_000)
                   └─ null returned (timeout/error) → return (silent skip)
                   └─ string returned → message.channel.send(response)
```

### Probability mechanism

```ts
const chance = Math.random() * 0.02;
if (Math.random() >= chance) return;
```

`P(X < Y × 0.02)` for two independent uniform [0,1] variables = exactly 1% average, but the effective threshold floats each message.

### Personalities (6, pick 1 at random)

| Key | Description |
|-----|-------------|
| `sarcastic_redditor` | Passive-aggressive, downvote energy, "this is fine" irony |
| `conspiracy_theorist` | Connects unrelated things, "they don't want you to know" |
| `dark_comedian` | Gallows humor, makes light of suffering, dry delivery |
| `gen_z_brainrot` | "no cap", "it's giving", "slay", chaotic short-attention-span energy |
| `philosopher` | Misapplied Nietzsche/Camus, existential dread as small talk |
| `sports_commentator` | Treats mundane chat like a live playoff game |

### Response formats (6, pick 1 at random independently of personality)

| Key | Description |
|-----|-------------|
| `one_liner` | Single punchy joke or observation |
| `fake_headline` | Breaking news headline about the conversation |
| `haiku` | Loose 5-7-5 about what just happened |
| `unhinged_tweet` | <280 chars with chaotic hashtags |
| `well_actually` | 2-sentence pedantic correction or unsolicited take |
| `wikipedia_intro` | Dry encyclopedic opening sentence about the conversation topic |

### System prompt structure

```
You are responding in a Discord chat as a [PERSONALITY description].
Respond in this exact format: [FORMAT description].
Keep it under 200 characters unless the format requires more.
Do not greet anyone. Do not explain yourself. Just respond.
```

### User prompt structure

```
Here is the recent chat history:
[Username]: [message content]
[Username]: [message content]
...

Respond to this conversation. Stay in character. Be funny or darkly humorous.
```

Bots and empty messages are filtered out of the history before formatting.

---

## Reused utilities

- `callOllama(system, prompt, timeoutMs)` — `src/lib/ollama.ts`
- `OLLAMA_MODEL` env var (defaults to `tinyllama`, compose overrides to `llama3.1:8b`)

---

## Constants

```ts
const TARGET_CHANNEL_ID = "199168135935295488";
const HISTORY_LIMIT = 20;
const OLLAMA_TIMEOUT_MS = 60_000;
```

---

## What is NOT included

- No per-guild config or DB involvement
- No cooldown beyond the probability roll
- No response to bot messages
- No hardcoded fallback text — Ollama responds or the turn is skipped

---

## Verification

1. `pnpm dev` — hot reload picks up new listener automatically
2. Send 100+ messages in channel `199168135935295488` — expect ~1 bot response
3. Kill Ollama mid-run — confirm bot silently skips, no error message in chat
4. Check logs — Ollama timeout errors should appear in console but not surface to Discord
5. Observe that responses vary in tone and format across multiple triggers
