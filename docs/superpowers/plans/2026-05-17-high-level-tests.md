# High-Level Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a comprehensive Vitest-based test suite covering RPG logic, catalog consistency, database integration, and build smoke tests.

**Architecture:** Vitest (ESM-native, TypeScript-first) with `@vitest/coverage-v8`. Unit tests cover pure logic and static catalog data. Integration tests run against a real PostgreSQL test database via a global setup hook. Smoke tests verify TypeScript compilation.

**Tech Stack:** Vitest, @vitest/coverage-v8, pg, drizzle-orm

---

## File Structure

```
tests/
├── setup/
│   └── globalSetup.ts       # Sets DATABASE_URL to test DB before any imports
├── unit/
│   ├── rpg/
│   │   ├── outcome.test.ts
│   │   ├── rewards.test.ts
│   │   └── cooldown.test.ts
│   └── catalog/
│       ├── jobs.test.ts
│       ├── items.test.ts
│       ├── pets.test.ts
│       └── properties.test.ts
├── integration/
│   └── db/
│       └── rpg-queries.test.ts
└── smoke/
    └── build.test.ts
vitest.config.ts             # Vitest configuration with #/* alias
```

---

### Task 1: Install Vitest and Coverage Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dev dependencies**

Run:
```bash
pnpm add -D vitest @vitest/coverage-v8
```

Expected: Both packages install successfully.

- [ ] **Step 2: Add test scripts to package.json**

Modify `package.json` scripts section:

```json
"scripts": {
	"dev": "tsx watch src/index.ts",
	"build": "tsc",
	"start": "node dist/index.js",
	"lint": "biome lint .",
	"format": "biome format . --write",
	"check": "biome check . --write",
	"test": "vitest run",
	"test:watch": "vitest",
	"test:coverage": "vitest run --coverage",
	"db:push": "drizzle-kit push",
	"db:generate": "drizzle-kit generate",
	"db:migrate": "drizzle-kit migrate",
	"db:studio": "drizzle-kit studio",
	"web:dev": "vite --config web/vite.config.ts",
	"web:build": "vite build --config web/vite.config.ts"
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
pnpm check
git commit -m "chore: add vitest and coverage dependencies"
```

---

### Task 2: Create Vitest Configuration

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Write vitest.config.ts**

```typescript
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		globalSetup: "./tests/setup/globalSetup.ts",
	},
	resolve: {
		alias: {
			"#": path.resolve(__dirname, "./src"),
		},
	},
});
```

- [ ] **Step 2: Commit**

```bash
git add vitest.config.ts
pnpm check
git commit -m "chore: add vitest configuration"
```

---

### Task 3: Create Global Test Setup

**Files:**
- Create: `tests/setup/globalSetup.ts`

- [ ] **Step 1: Write globalSetup.ts**

This file runs before any test modules are imported, ensuring `DATABASE_URL` points to the test database before `src/lib/database.ts` creates its connection pool.

```typescript
import { execSync } from "node:child_process";

const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5432/bhayanakbot_test";

export default function setup(): void {
	process.env.DATABASE_URL = TEST_DB_URL;

	// Run migrations against the test database
	execSync("pnpm db:migrate", {
		env: { ...process.env, DATABASE_URL: TEST_DB_URL },
		stdio: "inherit",
	});
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/setup/globalSetup.ts
pnpm check
git commit -m "chore: add vitest global setup for test database"
```

---

### Task 4: Write RPG Outcome Unit Tests

**Files:**
- Create: `tests/unit/rpg/outcome.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it, vi } from "vitest";
import { rollOutcome, randomPay } from "../../../src/lib/rpg/helpers/outcome.js";

describe("rollOutcome", () => {
	it("calculates stat bonus correctly", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: ["strength"],
			stats: { strength: 80, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
		});
		// base 0.5 + (80 - 50) * 0.003 = 0.5 + 0.09 = 0.59
		expect(result.finalChance).toBe(0.59);
	});

	it("applies tool bypass penalty", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
			toolBypass: true,
		});
		// 0.5 * 0.6 = 0.3
		expect(result.finalChance).toBe(0.3);
	});

	it("applies consumable bonus", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
			consumableBonus: 0.1,
		});
		expect(result.finalChance).toBe(0.6);
	});

	it("enforces minimum cap of 5%", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.01,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
		});
		expect(result.finalChance).toBe(0.05);
	});

	it("enforces maximum cap of 70%", () => {
		const result = rollOutcome({
			baseSuccessChance: 0.9,
			relevantStats: ["strength", "intelligence", "agility", "charisma"],
			stats: { strength: 100, intelligence: 100, agility: 100, charisma: 100, luck: 50 },
			consumableBonus: 0.2,
		});
		expect(result.finalChance).toBe(0.7);
	});

	it("returns success when Math.random is below finalChance", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.3);
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
		});
		expect(result.success).toBe(true);
		vi.restoreAllMocks();
	});

	it("returns failure when Math.random is above finalChance", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.6);
		const result = rollOutcome({
			baseSuccessChance: 0.5,
			relevantStats: [],
			stats: { strength: 50, intelligence: 50, agility: 50, charisma: 50, luck: 50 },
		});
		expect(result.success).toBe(false);
		vi.restoreAllMocks();
	});
});

describe("randomPay", () => {
	it("returns a value within the inclusive range", () => {
		for (let i = 0; i < 100; i++) {
			const pay = randomPay(50, 200);
			expect(pay).toBeGreaterThanOrEqual(50);
			expect(pay).toBeLessThanOrEqual(200);
		}
	});

	it("returns exact value when min equals max", () => {
		expect(randomPay(100, 100)).toBe(100);
	});
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/unit/rpg/outcome.test.ts
```

Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/rpg/outcome.test.ts
pnpm check
git commit -m "test: add RPG outcome unit tests"
```

---

### Task 5: Write RPG Rewards Unit Tests

**Files:**
- Create: `tests/unit/rpg/rewards.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it, vi } from "vitest";
import { calculateLevel, rollDrops } from "../../../src/lib/rpg/helpers/rewards.js";

describe("calculateLevel", () => {
	it("returns 0 for 0 XP", () => {
		expect(calculateLevel(0)).toBe(0);
	});

	it("returns 1 at 400 XP", () => {
		expect(calculateLevel(400)).toBe(1);
	});

	it("returns 2 at 2500 XP", () => {
		expect(calculateLevel(2500)).toBe(2);
	});

	it("returns correct level at boundary", () => {
		// floor(0.05 * sqrt(1600)) = floor(0.05 * 40) = floor(2) = 2
		expect(calculateLevel(1600)).toBe(2);
	});
});

describe("rollDrops", () => {
	it("returns empty array when drop table is empty", () => {
		expect(rollDrops([])).toEqual([]);
	});

	it("drops item when roll is below dropRate", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.03);
		const drops = rollDrops(["old_coin"]);
		expect(drops).toContain("old_coin");
		vi.restoreAllMocks();
	});

	it("does not drop item when roll is above dropRate", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.9);
		const drops = rollDrops(["old_coin"]);
		expect(drops).not.toContain("old_coin");
		vi.restoreAllMocks();
	});

	it("rolls each item independently", () => {
		let callCount = 0;
		vi.spyOn(Math, "random").mockImplementation(() => {
			callCount++;
			return callCount === 1 ? 0.03 : 0.9;
		});
		const drops = rollDrops(["old_coin", "rare_gem"]);
		expect(drops).toEqual(["old_coin"]);
		vi.restoreAllMocks();
	});
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/unit/rpg/rewards.test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/rpg/rewards.test.ts
pnpm check
git commit -m "test: add RPG rewards unit tests"
```

---

### Task 6: Write RPG Cooldown Unit Tests

**Files:**
- Create: `tests/unit/rpg/cooldown.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import { formatDuration } from "../../../src/lib/rpg/helpers/cooldown.js";

describe("formatDuration", () => {
	it("formats 0 ms as 0s", () => {
		expect(formatDuration(0)).toBe("0s");
	});

	it("formats 90 seconds as 1m 30s", () => {
		expect(formatDuration(90_000)).toBe("1m 30s");
	});

	it("formats 1 hour 1 minute 1 second", () => {
		expect(formatDuration(3_661_000)).toBe("1h 1m 1s");
	});

	it("formats exactly 1 hour", () => {
		expect(formatDuration(3_600_000)).toBe("1h");
	});

	it("formats exactly 1 minute", () => {
		expect(formatDuration(60_000)).toBe("1m");
	});

	it("formats exactly 1 second", () => {
		expect(formatDuration(1_000)).toBe("1s");
	});

	it("formats complex duration", () => {
		expect(formatDuration(3661_000)).toBe("1h 1m 1s");
	});
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/unit/rpg/cooldown.test.ts
```

Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/rpg/cooldown.test.ts
pnpm check
git commit -m "test: add RPG cooldown unit tests"
```

---

### Task 7: Write Jobs Catalog Consistency Tests

**Files:**
- Create: `tests/unit/catalog/jobs.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import { JOBS } from "../../../src/lib/rpg/catalogs/jobs.js";
import { ITEMS } from "../../../src/lib/rpg/catalogs/items.js";

describe("jobs catalog consistency", () => {
	it("has unique job IDs", () => {
		const ids = Object.values(JOBS).map((j) => j.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("references only existing items in dropTable", () => {
		for (const job of Object.values(JOBS)) {
			for (const itemId of job.dropTable) {
				expect(ITEMS[itemId]).toBeDefined();
			}
		}
	});

	it("references only tool items in toolBypass", () => {
		for (const job of Object.values(JOBS)) {
			if (job.toolBypass) {
				const item = ITEMS[job.toolBypass];
				expect(item).toBeDefined();
				expect(item.slot).toBe("tool");
			}
		}
	});

	it("has jailSentenceMs for all crime jobs", () => {
		for (const job of Object.values(JOBS)) {
			if (job.category === "crime") {
				expect(job.jailSentenceMs).toBeGreaterThan(0);
			}
		}
	});

	it("has baseSuccessChance in [0, 1]", () => {
		for (const job of Object.values(JOBS)) {
			expect(job.baseSuccessChance).toBeGreaterThanOrEqual(0);
			expect(job.baseSuccessChance).toBeLessThanOrEqual(1);
		}
	});

	it("has valid payRange", () => {
		for (const job of Object.values(JOBS)) {
			expect(job.payRange[0]).toBeGreaterThanOrEqual(0);
			expect(job.payRange[1]).toBeGreaterThanOrEqual(job.payRange[0]);
		}
	});

	it("has positive cooldownMs", () => {
		for (const job of Object.values(JOBS)) {
			expect(job.cooldownMs).toBeGreaterThan(0);
		}
	});
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/unit/catalog/jobs.test.ts
```

Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/catalog/jobs.test.ts
pnpm check
git commit -m "test: add jobs catalog consistency tests"
```

---

### Task 8: Write Items Catalog Consistency Tests

**Files:**
- Create: `tests/unit/catalog/items.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import { ITEMS } from "../../../src/lib/rpg/catalogs/items.js";

describe("items catalog consistency", () => {
	it("has unique item IDs", () => {
		const ids = Object.values(ITEMS).map((i) => i.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("has non-negative prices", () => {
		for (const item of Object.values(ITEMS)) {
			expect(item.price).toBeGreaterThanOrEqual(0);
		}
	});

	it("has dropRate in [0, 1] when present", () => {
		for (const item of Object.values(ITEMS)) {
			if (item.dropRate !== undefined) {
				expect(item.dropRate).toBeGreaterThanOrEqual(0);
				expect(item.dropRate).toBeLessThanOrEqual(1);
			}
		}
	});

	it("has positive effect values when present", () => {
		for (const item of Object.values(ITEMS)) {
			if (item.effect) {
				expect(item.effect.bonusPercent).toBeGreaterThan(0);
				expect(item.effect.durationMs).toBeGreaterThan(0);
			}
		}
	});
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/unit/catalog/items.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/catalog/items.test.ts
pnpm check
git commit -m "test: add items catalog consistency tests"
```

---

### Task 9: Write Pets Catalog Consistency Tests

**Files:**
- Create: `tests/unit/catalog/pets.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import { PETS } from "../../../src/lib/rpg/catalogs/pets.js";

describe("pets catalog consistency", () => {
	it("has unique pet IDs", () => {
		const ids = Object.values(PETS).map((p) => p.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("has non-negative prices", () => {
		for (const pet of Object.values(PETS)) {
			expect(pet.price).toBeGreaterThanOrEqual(0);
		}
	});

	it("has valid rarity values", () => {
		const validRarities = new Set(["common", "uncommon", "rare", "legendary"]);
		for (const pet of Object.values(PETS)) {
			expect(validRarities.has(pet.rarity)).toBe(true);
		}
	});
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/unit/catalog/pets.test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/catalog/pets.test.ts
pnpm check
git commit -m "test: add pets catalog consistency tests"
```

---

### Task 10: Write Properties Catalog Consistency Tests

**Files:**
- Create: `tests/unit/catalog/properties.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import { PROPERTIES } from "../../../src/lib/rpg/catalogs/properties.js";

describe("properties catalog consistency", () => {
	it("has unique property IDs", () => {
		const ids = Object.values(PROPERTIES).map((p) => p.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("has positive prices", () => {
		for (const property of Object.values(PROPERTIES)) {
			expect(property.price).toBeGreaterThan(0);
		}
	});

	it("has non-negative incomePerHour", () => {
		for (const property of Object.values(PROPERTIES)) {
			expect(property.incomePerHour).toBeGreaterThanOrEqual(0);
		}
	});

	it("has non-negative storageBonus", () => {
		for (const property of Object.values(PROPERTIES)) {
			expect(property.storageBonus).toBeGreaterThanOrEqual(0);
		}
	});
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/unit/catalog/properties.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/catalog/properties.test.ts
pnpm check
git commit -m "test: add properties catalog consistency tests"
```

---

### Task 11: Write Database Integration Tests

**Files:**
- Create: `tests/integration/db/rpg-queries.test.ts`

- [ ] **Step 1: Write the test file**

The global setup already set `DATABASE_URL` and ran migrations. This file imports the query helpers after that setup is complete.

```typescript
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/lib/database.js";
import {
	getOrCreateProfile,
	updateCoins,
	tryDebitCoins,
	addItem,
	getInventory,
	setCooldown,
	getCooldown,
	clearCooldown,
} from "../../../src/db/queries/rpg.js";
import { getRemainingCooldown } from "../../../src/lib/rpg/helpers/cooldown.js";
import { rpgProfiles, rpgStats, rpgInventory, rpgCooldowns } from "../../../src/db/schema.js";

const TEST_USER_ID = "test-user-123";

async function cleanupTestUser(): Promise<void> {
	await db.delete(rpgCooldowns).where(eq(rpgCooldowns.userId, TEST_USER_ID));
	await db.delete(rpgInventory).where(eq(rpgInventory.userId, TEST_USER_ID));
	await db.delete(rpgStats).where(eq(rpgStats.userId, TEST_USER_ID));
	await db.delete(rpgProfiles).where(eq(rpgProfiles.userId, TEST_USER_ID));
}

import { eq } from "drizzle-orm";

describe("RPG database queries", () => {
	beforeEach(async () => {
		await cleanupTestUser();
	});

	describe("getOrCreateProfile", () => {
		it("creates a new profile and stats for a new user", async () => {
			const { profile, stats } = await getOrCreateProfile(TEST_USER_ID);
			expect(profile.userId).toBe(TEST_USER_ID);
			expect(profile.coins).toBe(0);
			expect(stats.userId).toBe(TEST_USER_ID);
			expect(stats.strength).toBe(0);
		});

		it("returns existing profile without duplicating", async () => {
			await getOrCreateProfile(TEST_USER_ID);
			const { profile, stats } = await getOrCreateProfile(TEST_USER_ID);
			expect(profile.userId).toBe(TEST_USER_ID);
			expect(stats.userId).toBe(TEST_USER_ID);

			const profiles = await db.query.rpgProfiles.findMany({
				where: eq(rpgProfiles.userId, TEST_USER_ID),
			});
			expect(profiles.length).toBe(1);
		});
	});

	describe("updateCoins", () => {
		it("adds coins to a profile", async () => {
			await getOrCreateProfile(TEST_USER_ID);
			await updateCoins(TEST_USER_ID, 100);
			const profile = await db.query.rpgProfiles.findFirst({
				where: eq(rpgProfiles.userId, TEST_USER_ID),
			});
			expect(profile?.coins).toBe(100);
		});

		it("subtracts coins with negative delta", async () => {
			await getOrCreateProfile(TEST_USER_ID);
			await updateCoins(TEST_USER_ID, 500);
			await updateCoins(TEST_USER_ID, -200);
			const profile = await db.query.rpgProfiles.findFirst({
				where: eq(rpgProfiles.userId, TEST_USER_ID),
			});
			expect(profile?.coins).toBe(300);
		});
	});

	describe("tryDebitCoins", () => {
		it("returns new balance on successful debit", async () => {
			await getOrCreateProfile(TEST_USER_ID);
			await updateCoins(TEST_USER_ID, 500);
			const result = await tryDebitCoins(TEST_USER_ID, 200);
			expect(result).toBe(300);
		});

		it("returns null when balance is insufficient", async () => {
			await getOrCreateProfile(TEST_USER_ID);
			const result = await tryDebitCoins(TEST_USER_ID, 100);
			expect(result).toBeNull();
		});

		it("does not modify balance on failure", async () => {
			await getOrCreateProfile(TEST_USER_ID);
			await updateCoins(TEST_USER_ID, 50);
			await tryDebitCoins(TEST_USER_ID, 100);
			const profile = await db.query.rpgProfiles.findFirst({
				where: eq(rpgProfiles.userId, TEST_USER_ID),
			});
			expect(profile?.coins).toBe(50);
		});
	});

	describe("addItem / getInventory", () => {
		it("adds a new item to inventory", async () => {
			await getOrCreateProfile(TEST_USER_ID);
			await addItem(TEST_USER_ID, "fishing_rod", 1);
			const inventory = await getInventory(TEST_USER_ID);
			expect(inventory.length).toBe(1);
			expect(inventory[0].itemId).toBe("fishing_rod");
			expect(inventory[0].quantity).toBe(1);
		});

		it("stacks quantity for existing items", async () => {
			await getOrCreateProfile(TEST_USER_ID);
			await addItem(TEST_USER_ID, "fishing_rod", 1);
			await addItem(TEST_USER_ID, "fishing_rod", 2);
			const inventory = await getInventory(TEST_USER_ID);
			expect(inventory.length).toBe(1);
			expect(inventory[0].quantity).toBe(3);
		});
	});

	describe("cooldowns", () => {
		it("sets and retrieves a cooldown", async () => {
			await setCooldown(TEST_USER_ID, "work", 60_000);
			const expiresAt = await getCooldown(TEST_USER_ID, "work");
			expect(expiresAt).not.toBeNull();
			expect(expiresAt!.getTime()).toBeGreaterThan(Date.now());
		});

		it("returns remaining cooldown time", async () => {
			await setCooldown(TEST_USER_ID, "work", 60_000);
			const remaining = await getRemainingCooldown(TEST_USER_ID, "work");
			expect(remaining).toBeGreaterThan(0);
			expect(remaining).toBeLessThanOrEqual(60_000);
		});

		it("returns 0 when cooldown has expired", async () => {
			await setCooldown(TEST_USER_ID, "work", 1);
			// Wait for cooldown to expire
			await new Promise((resolve) => setTimeout(resolve, 10));
			const remaining = await getRemainingCooldown(TEST_USER_ID, "work");
			expect(remaining).toBe(0);
		});

		it("returns 0 when no cooldown exists", async () => {
			const remaining = await getRemainingCooldown(TEST_USER_ID, "nonexistent");
			expect(remaining).toBe(0);
		});

		it("clears a cooldown", async () => {
			await setCooldown(TEST_USER_ID, "work", 60_000);
			await clearCooldown(TEST_USER_ID, "work");
			const expiresAt = await getCooldown(TEST_USER_ID, "work");
			expect(expiresAt).toBeNull();
		});
	});
});
```

- [ ] **Step 2: Run the test**

Prerequisite: A local PostgreSQL instance with a `bhayanakbot_test` database, or set `TEST_DATABASE_URL` to a valid Postgres URL.

```bash
# Create test database if using local postgres
# psql -U postgres -c "CREATE DATABASE bhayanakbot_test;"

pnpm vitest run tests/integration/db/rpg-queries.test.ts
```

Expected: All 12 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/db/rpg-queries.test.ts
pnpm check
git commit -m "test: add RPG database integration tests"
```

---

### Task 12: Write Build Smoke Test

**Files:**
- Create: `tests/smoke/build.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

describe("build smoke tests", () => {
	it("compiles TypeScript without errors", () => {
		expect(() => {
			execSync("npx tsc --noEmit", { stdio: "pipe" });
		}).not.toThrow();
	});

	it("can import BhayanakClient without errors", async () => {
		const { BhayanakClient } = await import("../../src/lib/BhayanakClient.js");
		expect(BhayanakClient).toBeDefined();
		expect(typeof BhayanakClient).toBe("function");
	});
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm vitest run tests/smoke/build.test.ts
```

Expected: Both tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke/build.test.ts
pnpm check
git commit -m "test: add build smoke tests"
```

---

### Task 13: Run Full Test Suite and Verify

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: All unit, integration, and smoke tests pass.

- [ ] **Step 2: Run with coverage**

```bash
pnpm test:coverage
```

Expected: Coverage report generated. Check that `src/lib/rpg/` and `src/db/queries/` show meaningful coverage.

- [ ] **Step 3: Run Biome check**

```bash
pnpm check
```

Expected: No lint or format errors in test files.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
pnpm check
git commit -m "test: complete high-level test suite (Phase 1)"
```

---

## Self-Review

**Spec coverage check:**
- RPG logic unit tests (outcome, rewards, cooldown) → Tasks 4, 5, 6
- Catalog consistency tests (jobs, items, pets, properties) → Tasks 7, 8, 9, 10
- Database integration tests → Task 11
- Build smoke test → Task 12
- Vitest config and setup → Tasks 2, 3
- Package scripts → Task 1

All spec requirements are covered.

**Placeholder scan:**
- No "TBD", "TODO", or vague steps.
- All test code is complete and runnable.
- All commands have expected outputs.

**Type consistency:**
- Import paths use `.js` extensions consistently (ESM).
- Path alias `#/` maps to `./src` in vitest config, matching tsconfig.
- Function names match source code exactly.

**No issues found.**
