import { addItem, updateCoins } from "../../../db/queries/rpg.js";
import { ITEMS } from "../catalogs/items.js";

/**
 * Calculates RPG level from total XP.
 * Formula: level = floor(0.05 * sqrt(xp))
 */
export function calculateLevel(xp: number): number {
	return Math.floor(0.05 * Math.sqrt(xp));
}

/**
 * Rolls loot drops from a job's dropTable.
 * Each item in the table is rolled independently at its dropRate.
 * Returns list of itemIds that dropped.
 */
export function rollDrops(dropTable: string[]): string[] {
	const dropped: string[] = [];
	for (const itemId of dropTable) {
		const item = ITEMS[itemId];
		if (item?.dropRate && Math.random() < item.dropRate) {
			dropped.push(itemId);
		}
	}
	return dropped;
}

/**
 * Applies coins + item drops to a player after a successful job.
 * Returns dropped item ids for display.
 */
export async function applyJobRewards(
	userId: string,
	coins: number,
	dropTable: string[],
): Promise<{ droppedItems: string[] }> {
	await updateCoins(userId, coins);
	const droppedItems = rollDrops(dropTable);
	for (const itemId of droppedItems) {
		await addItem(userId, itemId);
	}
	return { droppedItems };
}
