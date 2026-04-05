import { getCooldown, setCooldown } from "../../../db/queries/rpg.js";

/** Returns remaining ms on a cooldown, or 0 if not on cooldown */
export async function getRemainingCooldown(userId: string, action: string): Promise<number> {
	const expiresAt = await getCooldown(userId, action);
	if (!expiresAt) return 0;
	const remaining = expiresAt.getTime() - Date.now();
	return remaining > 0 ? remaining : 0;
}

/** Formats milliseconds as a human-readable string: "1h 23m 45s" */
export function formatDuration(ms: number): string {
	const totalSeconds = Math.ceil(ms / 1000);
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0 || parts.length === 0) parts.push(`${s}s`);
	return parts.join(" ");
}

export { setCooldown };
