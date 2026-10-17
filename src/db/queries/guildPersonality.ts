import { container } from "@sapphire/framework";
import { eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { guildPersonalityProfiles } from "../schema.js";

export async function getGuildPersonalityProfile(guildId: string): Promise<string | null> {
	container.logger.debug(`[guild-personality-db] get-profile start guildId=${guildId}`);
	const row = await db.query.guildPersonalityProfiles.findFirst({
		where: eq(guildPersonalityProfiles.guildId, guildId),
		columns: { profile: true },
	});
	container.logger.debug(
		`[guild-personality-db] get-profile result guildId=${guildId} profile=${row?.profile ? `present length=${row.profile.length}` : "missing"}`,
	);
	return row?.profile ?? null;
}
