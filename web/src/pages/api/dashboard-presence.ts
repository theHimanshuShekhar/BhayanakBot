import { getLatestDashboardPresenceSnapshot } from "../../../../src/db/queries/dashboardPresence.js";
import { isDashboardRequestAuthorized } from "../../lib/dashboardAuth.js";

let warnedOpen = false;

export async function GET({ request }: { request: Request }): Promise<Response> {
	// Read at request time from process.env: import.meta.env may be inlined at build time, and the token is runtime config.
	// A blank value counts as unset.
	const token = process.env.DASHBOARD_API_TOKEN?.trim() || undefined;
	if (!token && !warnedOpen) {
		warnedOpen = true;
		console.warn(
			"DASHBOARD_API_TOKEN is not set: /api/dashboard-presence is open to anyone who can reach this server. Set it on any internet-reachable deployment.",
		);
	}
	// 404 rather than 401 so the endpoint is not advertised.
	if (!isDashboardRequestAuthorized(request.headers.get("authorization"), token)) {
		return new Response("Not found", { status: 404 });
	}

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
