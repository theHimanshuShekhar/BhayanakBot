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
