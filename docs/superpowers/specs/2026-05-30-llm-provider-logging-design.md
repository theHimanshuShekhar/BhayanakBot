# LLM Provider Logging Design

## Goal

Add relevant, detailed logs around LLM provider usage so production behavior is easier to diagnose without exposing Discord message content, prompts, responses, API keys, user IDs, or channel IDs.

## Scope

The change covers two logging layers:

- Provider-level metadata in `src/lib/llmProvider.ts` for interactive and background LLM calls.
- Caller labels at direct call sites so provider logs can identify which feature triggered the request.

The change does not alter provider selection semantics, prompt construction, model outputs, cooldowns, or command behavior.

## Provider Logs

Each provider request should log metadata only:

- Request id.
- Mode: `interactive` or `background`.
- Caller label when supplied.
- Timeout budget and remaining fallback budget.
- Zen configuration metadata such as model and base URL host, never the API key.
- Zen result: success, missing config, HTTP failure, fetch error, empty content, refusal-only content, elapsed time, and output length when successful.
- Ollama fallback start and result metadata via existing fallback calls.

## Caller Labels

`callInteractiveLlm` and `callBackgroundLlm` should accept an optional label. Direct callers should pass feature-oriented labels such as:

- `autoresponder:auto-response`
- `autoresponder:mention-reply`
- `autoresponder:chat-response`
- `random-responder`
- `mention-responder`
- `summarize`
- `personality:user`
- `personality:guild`

Labels must be static feature labels. They must not include Discord user IDs, guild IDs, channel IDs, message content, display names, or generated text.

## Testing

Unit tests should continue to verify Zen-first behavior and Ollama fallback behavior. Tests should also cover label forwarding by checking that the label is passed to low-priority fallback calls and that the new optional interactive label does not affect existing provider behavior.

## Self-Review

No placeholders remain. The scope is limited to provider metadata logs and direct caller labels. The spec explicitly excludes sensitive prompt, response, key, and Discord identifier logging.
