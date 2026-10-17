---
status: accepted
supersedes: ADR-0002
---

# Zen is the only language model provider; RPG and Ollama are removed

The local Ollama provider existed to power RPG flavor text, daily quest generation, and a fallback for AI replies and personality profiles. RPG was disabled with no players (zero profiles in production), and with it gone the only remaining Ollama consumer was a fallback that was itself switched off. We deleted the RPG feature and its tables, the daily quest task, `RPG_ENABLED`, `LOCAL_LLM_ENABLED`, the Ollama client and queue, and every `OLLAMA_*` setting. The opencode Zen hosted endpoint is now the only provider; when it is unconfigured, not permitted to receive Discord content, or failing, AI features degrade silently rather than falling back.

## Considered Options

Keeping RPG dormant behind its flag was rejected: it carried known integrity bugs (non-atomic debit-then-grant) that every future change had to keep compiling around. Keeping Ollama as an offline fallback was rejected because it was never enabled in production and its queueing, warmup, and model-pull paths were untested weight.

## Consequences

The personality e2e test that required a real local model (ADR-0002) now targets Zen instead: it is opt-in, needs a Zen key, never runs in CI by default, and is required when prompts or profile generation change. It still asserts profile structure, not prose. Bringing RPG back means rebuilding it from git history, including a fresh migration for its tables.

## Amendment (2026-10-17): Zen Go, a Primary and a Backup Model

From at least 2026-09-17, Zen rejected every request (HTTP 400 `MissingSessionID`), so no AI feature worked in production. The bot stays on the Zen Go subscription and sends what Go requires: a stable `x-opencode-session` per conversation (one AI feature in one channel, or one profile being generated) and its own user agent. Pay-as-you-go Zen was considered: it needs no session header and its docs explicitly allow direct API use, but it is billed per token instead of covered by the subscription. Go's terms are written for coding agents and its traffic is monitored for abuse; we accept that risk. If Go objects to the bot's traffic, pay-as-you-go is the next step, on the same vendor and key.

Each request goes to a Primary Model (`deepseek-v4.1-flash`). It gets one retry on a Backup Model (`glm-5.3-flash`) when the primary fails (HTTP or network error, timeout, empty reply, reply cut off at the token limit) or refuses. Both models are environment settings. This is a second model, not a fallback provider: Zen remains the only provider.
