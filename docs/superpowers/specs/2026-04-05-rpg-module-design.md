# RPG Module Design

**Date:** 2026-04-05  
**Status:** Approved

---

## Context

BhayanakBot currently has a leveling/XP system but no RPG gameplay. This design adds a full text-based RPG module — jobs, stats, crime, pets, housing, and inventory — as a standalone feature layer on top of the existing bot. The goal is to give users an engaging, persistent progression system playable across any Discord server.

---

## Scope

This design covers:
- Player profiles with coins, level, XP
- Five trainable base stats (Strength, Intelligence, Agility, Charisma, Luck)
- Jobs (fishing, blue/white collar, crime) gated by stats
- Single-turn outcome system (RNG + stat influence, max 70% success)
- Jail system (timed sentence, bail, escape attempt)
- Item catalog, shop, and inventory
- Cosmetic pets (schema extensible for future battle)
- Houses and businesses (passive income + storage)
- Ollama-generated flavor text for responses
- Phased delivery across 4 independent phases

**Out of scope:** Turn-based combat, PvP battle, pet abilities, monetization.

---

## Architecture Decision: Global Scope

All RPG data is **per-user globally** — no `guildId` on RPG tables. A player's profile, stats, inventory, and coins are shared across every Discord server. This means a player progressing on one server carries that progress everywhere.

---

## Database Schema

All new tables added to `src/db/schema.ts`.

### `rpgProfiles`
```
userId        varchar(20) PK     — Discord user ID
coins         integer default 0
level         integer default 1
xp            integer default 0
jailUntil     timestamp nullable — null means not in jail
jailBailCost  integer nullable   — set at sentencing
createdAt     timestamp defaultNow()
```

### `rpgStats`
```
userId        varchar(20) PK FK → rpgProfiles
strength      integer default 1
intelligence  integer default 1
agility       integer default 1
charisma      integer default 1
luck          integer default 1
strTrainedAt  timestamp nullable
intTrainedAt  timestamp nullable
agiTrainedAt  timestamp nullable
chaTrainedAt  timestamp nullable
lukTrainedAt  timestamp nullable
```
Stats range 1–100. Training cooldown timestamps tracked per stat.

### `rpgCooldowns`
```
userId        varchar(20)
action        varchar(50)         — e.g. "job:fishing", "crime:rob_player"
expiresAt     timestamp
PRIMARY KEY (userId, action)
```

### `rpgInventory`
```
id            serial PK
userId        varchar(20)
itemId        varchar(50)         — references items catalog constant
quantity      integer default 1
equippedSlot  varchar(30) nullable — e.g. "tool", "consumable"
```

### `rpgOwnedPets`
```
id            serial PK
userId        varchar(20)
petId         varchar(50)         — references pets catalog constant
nickname      varchar(32) nullable
acquiredAt    timestamp defaultNow()
```

### `rpgOwnedProperties`
```
id                serial PK
userId            varchar(20)
propertyId        varchar(50)     — references properties catalog constant
purchasedAt       timestamp defaultNow()
lastCollectedAt   timestamp defaultNow()
```

### Query helpers
All in `src/db/queries/rpg.ts`:
- `getOrCreateProfile(userId)`
- `updateCoins(userId, delta)` — add or subtract
- `getStats(userId)` / `updateStat(userId, stat, value)`
- `setCooldown(userId, action, duration)` / `getCooldown(userId, action)`
- `isInJail(userId)` / `setJail(userId, until, bailCost)` / `clearJail(userId)`
- `getInventory(userId)` / `addItem(userId, itemId)` / `removeItem(userId, itemId)`
- `getOwnedPets(userId)` / `addPet(userId, petId)`
- `getProperties(userId)` / `addProperty(userId, propertyId)` / `updateCollectedAt(userId, propertyId)`

---

## Static Catalogs (TypeScript constants)

Live in `src/lib/rpg/catalogs/`. Editing these files adds new content without DB migrations.

### `items.ts`
```typescript
export type Item = {
  id: string;
  name: string;
  description: string;
  price: number;           // 0 = not buyable (drop only)
  slot: "tool" | "consumable" | "collectible" | null;
  effect?: { stat: string; bonus: number; duration?: number }; // consumables
  dropRate?: number;       // 0–1, chance to drop from eligible jobs
};
```

Sample items:
| id | name | price | slot | notes |
|---|---|---|---|---|
| `fishing_rod` | Fishing Rod | 200 | tool | Required for fishing (risky without) |
| `pickaxe` | Pickaxe | 500 | tool | Required for mining (risky without) |
| `lockpick` | Lockpick | 300 | tool | Improves crime success |
| `briefcase` | Briefcase | 800 | tool | Improves white-collar success |
| `energy_drink` | Energy Drink | 100 | consumable | -30min cooldown on next job |
| `lucky_charm` | Lucky Charm | 250 | consumable | +10% success on next action |
| `jail_key` | Jail Key | 1500 | consumable | Instant jail escape |
| `rare_gem` | Rare Gem | 0 | collectible | Drop-only, sell for 2000 |

### `jobs.ts`
```typescript
export type Job = {
  id: string;
  name: string;
  category: "fishing" | "blue_collar" | "white_collar" | "crime";
  statRequirements: Partial<Record<StatKey, number>>;
  toolBypass?: string;     // itemId: can attempt without stat gate but higher risk
  baseSuccessChance: number; // 0–1 before stat influence
  payRange: [number, number];
  cooldownMs: number;
  xpReward: number;
  dropTable?: string[];    // itemIds that can drop
  jailSentenceMs?: number; // crime jobs only
};
```

| Job | Category | Stat Gate | Tool Bypass | Pay Range | Cooldown |
|---|---|---|---|---|---|
| Fishing | fishing | none | `fishing_rod` | 50–200 | 5 min |
| Construction | blue_collar | STR 30 | — | 150–400 | 15 min |
| Delivery | blue_collar | AGI 20 | — | 100–300 | 10 min |
| Mining | blue_collar | STR 50 | `pickaxe` | 200–600 | 30 min |
| Programmer | white_collar | INT 60 | — | 500–1200 | 1h |
| Lawyer | white_collar | INT 70, CHA 50 | — | 800–2000 | 2h |
| Doctor | white_collar | INT 80 | — | 1000–2500 | 2h |
| Pickpocket | crime | none | — | 20–100 stolen | 10 min |
| Rob Player | crime | AGI 30 | — | 100–500 stolen | 30 min |

> **Rob Player outcome:** On success, coins transfer from victim to attacker. On failure, attacker goes to jail AND victim receives 20% of the attempted steal amount as a "compensation" payout from the attacker's balance.
| Rob Bank | crime | INT 60, AGI 50 | — | 2000–8000 | 6h |

### `pets.ts`
```typescript
export type Pet = {
  id: string;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  description: string;
  price: number;           // 0 = not buyable (event/drop only)
  // Reserved for Phase 5 battle system:
  baseStats?: { hp: number; attack: number; defense: number; speed: number };
};
```

### `properties.ts`
```typescript
export type Property = {
  id: string;
  name: string;
  category: "house" | "business";
  price: number;
  incomePerHour: number;   // coins, 0 for purely cosmetic
  storageBonus: number;    // extra inventory slots
  description: string;
};
```

---

## Core Mechanics

### Outcome Formula (`src/lib/rpg/helpers/outcome.ts`)

```
statBonus     = (relevantStat - 50) * 0.003    // ±15% max at stat 100 or 1
rawChance     = job.baseSuccessChance + statBonus
finalChance   = clamp(rawChance, 0.05, 0.70)
success       = Math.random() < finalChance
```

Tool bypass (no stat gate met but tool equipped): `baseSuccessChance *= 0.6` before applying stat bonus.

### Training (`/train <stat>`)

Two paths per stat:
- **Free (cooldown):** 4h cooldown per stat, grants +1–2 points
- **Pay:** costs `Math.floor(currentStat * 15)` coins, grants +1–2 points, no cooldown

Stats cap at 100. Both paths use the same `updateStat()` query helper.

### Jail System

On failed crime:
1. `jailUntil = now + job.jailSentenceMs`, `jailBailCost = Math.floor(crimePayMin * 0.5)`
2. Response embed shows sentence duration and two buttons (handled by `src/interaction-handlers/rpgJailActions.ts`):
   - **Pay Bail** — deducts `jailBailCost`, calls `clearJail(userId)`
   - **Escape (one attempt)** — outcome roll using Agility; success = `clearJail()`, failure = `jailUntil += jailSentenceMs` (doubled), button disabled after use
3. `/work` and `/crime` check `isInJail()` first and return a jail embed with `<t:${jailUntil}:R>` countdown if blocked

### Passive Income

`src/scheduled-tasks/collectPropertyIncome.ts` — runs on the existing 30-second interval pattern. Calculates `hoursSince(lastCollectedAt) * property.incomePerHour` for each owned property and stores the pending amount. Players claim via `/property collect` — no auto-deposit, keeps it interactive.

---

## Ollama Flavor Text

### Infrastructure

New service in `docker-compose.yml`:
```yaml
ollama:
  image: ollama/ollama
  volumes:
    - ollama_data:/root/.ollama
  environment:
    - OLLAMA_NUM_PARALLEL=1
    - OLLAMA_MAX_LOADED_MODELS=1
```

Model: `tinyllama` (638MB) or `phi3:mini` (2.3GB) — configurable via env var `OLLAMA_MODEL`.

New env var: `OLLAMA_URL` (default `http://ollama:11434` in Docker, `http://localhost:11434` locally).

### Helper (`src/lib/rpg/helpers/flavorText.ts`)

```typescript
export async function generateFlavorText(context: {
  action: string;    // e.g. "job:fishing"
  success: boolean;
  pay?: number;
  playerName: string;
  details?: string;
}): Promise<string>
```

Builds a short system prompt ("You are a witty RPG narrator. One sentence only.") + user prompt with the outcome context. Falls back to a static string from a small hardcoded pool if Ollama is unreachable or times out (2s timeout).

Commands call `generateFlavorText()` after computing the outcome, then include it in the response embed as a flavor field.

---

## Command Structure

```
src/commands/rpg/
  profile.ts      — /profile
  train.ts        — /train <stat> [--pay]
  work.ts         — /work <job>
  crime.ts        — /crime <action> [--target @user]
  shop.ts         — /shop <browse|buy|sell> [item]
  inventory.ts    — /inventory <view|use|equip> [item]
  property.ts     — /property <view|buy|collect>
  pet.ts          — /pet <view|adopt|rename> [pet] [name]
```

All commands use `interaction.deferReply()` immediately (Ollama call can take 1–3s on CPU).

---

## Phased Delivery

| Phase | Deliverables | Commands |
|---|---|---|
| **1** | Schema, catalogs, profile, stats, training | `/profile`, `/train` |
| **2** | Jobs, cooldowns, shop, inventory | `/work`, `/shop`, `/inventory` |
| **3** | Crime, jail, Ollama integration | `/crime`, jail interaction handler |
| **4** | Pets, property, passive income | `/pet`, `/property`, scheduled task |

Each phase is independently usable. The full DB schema is created in Phase 1 so later phases only add commands, not migrations.

---

## Verification

End-to-end test sequence per phase:

**Phase 1:** Create a new Discord user, run `/profile` — should show zeroed stats. Run `/train strength` — should show cooldown set, stat incremented. Run `/train strength --pay` — should deduct coins, increment stat without cooldown.

**Phase 2:** Run `/work fishing` without a fishing rod — should succeed at reduced rate. Buy rod from `/shop buy fishing_rod` — confirm inventory. Run `/work fishing` again — improved rate. Check `/inventory view` shows rod equipped.

**Phase 3:** Run `/crime rob_bank` with low stats — expect jail on failure. Confirm `/work` is blocked. Test bail button deducts coins. Test escape button with high/low Agility player.

**Phase 4:** Buy a house via `/property buy small_house`. Run `/property collect` after time passes — confirm coins credited. Adopt a pet via `/pet adopt`. Confirm `/profile` shows pet.

**Ollama:** Bring down Ollama service — confirm bot falls back to static flavor text gracefully.
