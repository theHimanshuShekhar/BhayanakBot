# LLM Provider Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add detailed metadata-only logs around LLM provider usage and feature call sites.

**Architecture:** Keep provider logging centralized in `src/lib/llmProvider.ts`, with direct callers passing static feature labels through optional parameters. Preserve existing Zen-first and Ollama-fallback behavior while avoiding prompt, response, API key, and Discord identifier logging.

**Tech Stack:** TypeScript, Vitest, Sapphire bot runtime, existing `console.log` logging pattern in provider modules.

---

## Tasks

- [x] Add provider metadata logs and optional labels in `src/lib/llmProvider.ts`.
- [x] Add static feature labels at direct LLM call sites.
- [x] Verify focused LLM tests, full test suite, and TypeScript build.

## Self-Review

Spec coverage: provider metadata logs, caller labels, and verification are covered. Placeholder scan passed. Type consistency passed: both exported LLM functions take the same optional `label?: string` tail parameter.
