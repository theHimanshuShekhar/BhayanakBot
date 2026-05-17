import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
			expect(stats.strength).toBe(50);
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
