import { eq } from "drizzle-orm";
import type { DashboardPresencePayload } from "../../lib/dashboardPresence.js";
import { db } from "../../lib/database.js";
import { dashboardPresenceSnapshots } from "../schema.js";

export type DashboardPresenceSnapshot = typeof dashboardPresenceSnapshots.$inferSelect;

const LATEST_SNAPSHOT_NAME = "latest";

export async function writeDashboardPresenceSnapshot(
	payload: DashboardPresencePayload,
	capturedAt = new Date(),
): Promise<DashboardPresenceSnapshot> {
	const now = new Date();
	const [row] = await db
		.insert(dashboardPresenceSnapshots)
		.values({
			name: LATEST_SNAPSHOT_NAME,
			payload,
			capturedAt,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: dashboardPresenceSnapshots.name,
			set: {
				payload,
				capturedAt,
				updatedAt: now,
			},
		})
		.returning();

	return row;
}

export async function getLatestDashboardPresenceSnapshot(): Promise<DashboardPresenceSnapshot | null> {
	const row = await db.query.dashboardPresenceSnapshots.findFirst({
		where: eq(dashboardPresenceSnapshots.name, LATEST_SNAPSHOT_NAME),
	});
	return row ?? null;
}
