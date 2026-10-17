import { container } from "@sapphire/framework";
import { and, eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { userPersonalityProfiles } from "../schema.js";

export async function getPersonalityProfile(userId: string, guildId: string): Promise<string | null> {
	container.logger.debug(`[personality-db] get-profile start userId=${userId} guildId=${guildId}`);
	const row = await db.query.userPersonalityProfiles.findFirst({
		where: and(eq(userPersonalityProfiles.userId, userId), eq(userPersonalityProfiles.guildId, guildId)),
		columns: { profile: true },
	});
	container.logger.debug(
		`[personality-db] get-profile result userId=${userId} guildId=${guildId} profile=${row?.profile ? `present length=${row.profile.length}` : "missing"}`,
	);
	return row?.profile ?? null;
}
