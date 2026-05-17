# High-Level Test Suite Design

**Date:** 2026-05-17
**Status:** Approved
**Scope:** Add a comprehensive test suite to BhayanakBot to catch regressions in RPG logic, catalog consistency, database queries, and build integrity.

---

## Goals

1. Catch math/formula regressions in the RPG system before they reach production.
2. Ensure catalog data (jobs, items, pets, properties) remains internally consistent as content is added.
3. Verify database query helpers work correctly against a real PostgreSQL schema.
4. Guarantee the TypeScript project compiles cleanly and the bot can initialize its stores.
5. Lay the groundwork for future command-level and listener-level structural tests.

---

## Non-Goals

- Mocking Discord.js interactions or testing actual slash-command handlers (out of scope for Phase 1).
- Testing music playback, voice connections, or Ollama flavor text generation (too external / flaky).
- Achieving 100% coverage (target: meaningful coverage of business logic and DB queries).

---

## Architecture

### Testing Framework: Vitest

- **Why Vitest:** ESM-native, TypeScript-first, fast watch mode, built-in coverage via `@vitest/coverage-v8`, minimal config compared to Jest.
- **ESM compatibility:** The project uses `"type": "module"` (inferred from `.ts` imports with `.js` extensions). Vitest handles ESM out of the box.

### Test Directory Layout

```
tests/
├── unit/              # Pure logic, no external dependencies
│   ├── rpg/
│   │   ├── outcome.test.ts
│   │   ├── rewards.test.ts
│   │   └── cooldown.test.ts
│   └── catalog/
│       ├── jobs.test.ts
│       ├── items.test.ts
│       ├── pets.test.ts
│       └── properties.test.ts
├── integration/       # Requires PostgreSQL
│   └── db/
│       └── rpg-queries.test.ts
└── smoke/
    └── build.test.ts
```

### Package Scripts (to be added)

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

---

## Phase 1 — Foundation

### 1. Unit Tests: RPG Logic

**File:** `tests/unit/rpg/outcome.test.ts`

Test `rollOutcome()` from `src/lib/rpg/helpers/outcome.ts`:
- **Stat bonus math:** With `strength: 80`, bonus = `(80 - 50) * 0.003 = 0.09`. Verify finalChance includes this.
- **Tool bypass penalty:** When `toolBypass: true`, base chance is multiplied by `0.6`.
- **Consumable bonus:** `lucky_charm` grants `+0.1` (10%).
- **Hard caps:** Verify finalChance is clamped to `[0.05, 0.7]` regardless of inputs.
- **Deterministic success:** Mock `Math.random` to test both success and failure branches.

**File:** `tests/unit/rpg/rewards.test.ts`

Test `calculateLevel()` and `rollDrops()` from `src/lib/rpg/helpers/rewards.ts`:
- **Level boundaries:** `xp = 0` → level 0; `xp = 400` → `floor(0.05 * 20) = 1`; `xp = 2500` → `floor(0.05 * 50) = 2`.
- **Drop table:** Mock `Math.random` to verify items drop when roll < `dropRate`, and don't drop when roll >= `dropRate`.

**File:** `tests/unit/rpg/cooldown.test.ts`

Test `formatDuration()` from `src/lib/rpg/helpers/cooldown.ts`:
- `0 ms` → `"0s"`
- `90_000 ms` → `"1m 30s"`
- `3_661_000 ms` → `"1h 1m 1s"`
- `3_600_000 ms` → `"1h"`

### 2. Catalog Consistency Tests

These tests iterate over static catalog data and enforce invariants. They are extremely cheap to run and catch the most common content-authoring mistakes.

**File:** `tests/unit/catalog/jobs.test.ts`

- Every `job.id` is unique across `JOBS`.
- Every `job.dropTable[]` item exists in `ITEMS`.
- Every `job.toolBypass` (if present) references an item in `ITEMS` with `slot === "tool"`.
- Every crime job (`category === "crime"`) has `jailSentenceMs > 0`.
- `baseSuccessChance` is in `[0, 1]`.
- `payRange[0] <= payRange[1]` and both are non-negative.
- `cooldownMs > 0`.

**File:** `tests/unit/catalog/items.test.ts`

- Every `item.id` is unique across `ITEMS`.
- `price >= 0` for all items (`0` means drop-only).
- If `dropRate` is present, it is in `[0, 1]`.
- If `effect` is present, `bonusPercent` and `durationMs` are positive.

**File:** `tests/unit/catalog/pets.test.ts`

- Every `pet.id` is unique across `PETS`.
- `price >= 0` (`0` means event-only).
- `rarity` is one of: `common`, `uncommon`, `rare`, `legendary`.

**File:** `tests/unit/catalog/properties.test.ts`

- Every `property.id` is unique across `PROPERTIES`.
- `price > 0`.
- `incomePerHour >= 0`.
- `storageBonus >= 0`.

### 3. Database Integration Tests

**File:** `tests/integration/db/rpg-queries.test.ts`

**Test database setup:**
- Use a dedicated test database (e.g., `bhayanakbot_test`) or `testcontainers` to spin up PostgreSQL.
- Before all tests: run `pnpm db:migrate` against the test database.
- After each test: truncate RPG-related tables or wrap tests in transactions that roll back.

**Tests to cover:**
- `getOrCreateProfile`: Creates a new profile and stats row for a user ID; on second call, returns existing rows without duplicating.
- `updateCoins`: Adds coins atomically; negative delta subtracts coins.
- `tryDebitCoins`: Returns the new balance on success; returns `null` when user has insufficient funds; does not modify balance on failure.
- `addItem` / `getInventory`: Adds items to inventory; duplicate items stack (or are tracked separately per schema design).
- Cooldown get/set: `setCooldown` writes a future timestamp; `getRemainingCooldown` returns positive ms until that time, then `0`.

**Environment:**
- Tests read `DATABASE_URL` from `.env.test` or fall back to `postgresql://postgres:postgres@localhost:5432/bhayanakbot_test`.
- If the test database is unreachable, integration tests skip gracefully (optional but recommended for CI flexibility).

### 4. Build Smoke Test

**File:** `tests/smoke/build.test.ts`

- **TypeScript compilation:** Spawn `tsc --noEmit` and assert exit code `0`.
- **Client initialization:** Import `BhayanakClient`, instantiate with a minimal config (no Discord token required), and assert that `client.stores` registers commands, listeners, and interaction handlers without throwing.

---

## Phase 2 — Command & Listener Structure (Future)

After Phase 1 is running in CI:

1. **Command structure tests:** Dynamically import all `src/commands/**/*.ts`, instantiate each `Command` subclass, verify `name`, `description`, and `preconditions` are populated. Verify precondition names map to registered preconditions.
2. **Listener smoke tests:** Same pattern for `src/listeners/**/*.ts` — instantiate each `Listener` subclass without errors.

These tests require mocking the Sapphire client and Discord.js structures. They are deferred to Phase 2 because the setup cost is higher and the immediate regression value is lower than Phase 1.

---

## Dependencies to Add

```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0"
  }
}
```

Optional for integration tests:
```json
{
  "devDependencies": {
    "testcontainers": "^10.0.0"
  }
}
```

If `testcontainers` is not used, the integration tests assume a local `bhayanakbot_test` database and document the setup requirement.

---

## CI Integration

Add a GitHub Actions workflow (or equivalent) that:
1. Checks out the repo.
2. Installs dependencies with `pnpm`.
3. Starts PostgreSQL service (or uses `testcontainers` in the test step).
4. Runs `pnpm test`.
5. Runs `pnpm test:coverage` and uploads the report.

---

## Success Criteria

- [ ] `pnpm test` runs all Phase 1 tests and exits `0`.
- [ ] All RPG logic tests pass with deterministic mocked randomness.
- [ ] All catalog consistency tests pass.
- [ ] Integration tests pass against a real PostgreSQL instance.
- [ ] Build smoke test confirms `tsc --noEmit` succeeds.
- [ ] Coverage report is generated and shows >60% coverage of `src/lib/rpg/` and `src/db/queries/`.
