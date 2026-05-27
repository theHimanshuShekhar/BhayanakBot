import { getLatestPublicBotStatsSnapshot } from "../../../src/db/queries/publicStats.js";

export async function readLatestPublicBotStatsSnapshot() {
	try {
		return await getLatestPublicBotStatsSnapshot();
	} catch {
		return null;
	}
}
