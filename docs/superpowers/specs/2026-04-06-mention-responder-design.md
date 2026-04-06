# Mention Responder — Design Spec

**Date:** 2026-04-06  
**Status:** Approved

## Context

The bot currently ignores direct @mentions unless they match a command. Users expect a Discord bot to "talk back" when addressed. This feature makes the bot respond to any conversational @mention with a sarcastic, mocking reply — using the last 20 messages as context so the roast is targeted and relevant.

## What We're Building

A new Sapphire `Listener` on `messageCreate` that fires when the bot is @mentioned conversationally, calls Ollama with channel history, and replies with a short sarcastic response.

## Architecture

**New file:** `src/listeners/messages/mentionResponder.ts`

Sapphire auto-discovers and registers it. It fires on every `messageCreate` event in parallel with the existing `messageCreate.ts` listener — no modifications to existing files needed.

## Trigger Conditions

The listener fires only when ALL of the following are true:

1. Author is not a bot
2. Message is in a guild (not a DM)
3. `message.mentions.has(client.user.id)` — the bot is explicitly @mentioned
4. Message content after stripping the bot mention tag is non-empty — filters out bare mentions and avoids responding to slash command invocations

## Context Gathering

```
channel.messages.fetch({ limit: 20 })
  → filter out bot messages and empty content
  → reverse to chronological order
  → format as "username: message content" per line
```

Identical pattern to `src/listeners/messages/randomResponder.ts`.

## LLM Prompt Design

**System prompt:** The bot is a sarcastic, condescending, mildly contemptuous entity who finds humans amusing but exhausting. It delivers short, sharp roasts — never explains its jokes, never apologizes. Max 1-3 sentences.

**User prompt:** Full message history followed by:  
`"{username}" just summoned you by saying: "{their message content}". Respond directly to them.`

**Timeout:** 60 seconds (matching `randomResponder.ts`).

## Response Delivery

1. `channel.sendTyping()` — shows typing indicator while Ollama generates
2. `message.reply(response)` — threads the response to the triggering message

## Failure Handling

If `callOllama` returns `null` (timeout or error): do nothing. No fallback pool.

## Files

| File | Action |
|------|--------|
| `src/listeners/messages/mentionResponder.ts` | **Create** |
| `src/lib/ollama.ts` | Read-only (reuse `callOllama`) |
| `src/listeners/messages/randomResponder.ts` | Reference pattern only |

## Verification

1. Run `pnpm dev`
2. @mention the bot with a message in any guild channel — bot should reply with a sarcastic response threaded to the message
3. @mention the bot with no message content (bare mention) — bot should stay silent
4. Kill the Ollama service and @mention the bot — bot should stay silent (no error thrown, no fallback)
