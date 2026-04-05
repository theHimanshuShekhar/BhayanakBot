import { and, eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { afkUsers } from "../schema.js";

export type AfkUser = typeof afkUsers.$inferSelect;

export async function setAfk(userId: string, guildId: string, reason?: string): Promise<void> {
	await db
		.insert(afkUsers)
		.values({ userId, guildId, reason })
		.onConflictDoUpdate({ target: [afkUsers.userId, afkUsers.guildId], set: { reason, setAt: new Date() } });
}

export async function clearAfk(userId: string, guildId: string): Promise<void> {
	await db.delete(afkUsers).where(and(eq(afkUsers.userId, userId), eq(afkUsers.guildId, guildId)));
}

export async function getAfk(userId: string, guildId: string): Promise<AfkUser | undefined> {
	return db.query.afkUsers.findFirst({ where: and(eq(afkUsers.userId, userId), eq(afkUsers.guildId, guildId)) });
}
