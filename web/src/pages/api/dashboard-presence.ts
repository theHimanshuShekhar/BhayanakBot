import { getLatestDashboardPresenceSnapshot } from "../../../../src/db/queries/dashboardPresence.js";

export async function GET(): Promise<Response> {
	try {
		const snapshot = await getLatestDashboardPresenceSnapshot();
		if (!snapshot) {
			return Response.json({ error: "no dashboard presence snapshot yet" }, { status: 503 });
		}
		return Response.json({
			...(snapshot.payload as Record<string, unknown>),
			capturedAt: snapshot.capturedAt.toISOString(),
		});
	} catch {
		return Response.json({ error: "failed to read dashboard presence snapshot" }, { status: 503 });
	}
}
