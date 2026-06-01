import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { modCases } from "../schema.js";

export type ModCase = typeof modCases.$inferSelect;
export type ModCaseInsert = typeof modCases.$inferInsert;

export async function createCase(data: Omit<ModCaseInsert, "caseNumber" | "id">): Promise<ModCase> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${data.guildId}, 0))`);

		const [created] = await tx
			.insert(modCases)
			.values({
				...data,
				caseNumber: sql`COALESCE((SELECT MAX(case_number) FROM mod_cases WHERE guild_id = ${data.guildId}), 0) + 1`,
			})
			.returning();
		return created;
	});
}

export async function getCase(guildId: string, caseNumber: number): Promise<ModCase | undefined> {
	return db.query.modCases.findFirst({
		where: and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber)),
	});
}

export async function getUserCases(guildId: string, userId: string): Promise<ModCase[]> {
	return db.query.modCases.findMany({
		where: and(eq(modCases.guildId, guildId), eq(modCases.userId, userId)),
		orderBy: [desc(modCases.createdAt)],
	});
}

export async function updateCaseReason(id: number, reason: string): Promise<void> {
	await db.update(modCases).set({ reason }).where(eq(modCases.id, id));
}

export async function deactivateCase(id: number): Promise<void> {
	await db.update(modCases).set({ active: false }).where(eq(modCases.id, id));
}

export async function getExpiredActiveCases(type: "mute" | "tempban"): Promise<ModCase[]> {
	return db.query.modCases.findMany({
		where: and(eq(modCases.type, type), eq(modCases.active, true), lte(modCases.expiresAt, new Date())),
	});
}

export async function findRecentCase(
	guildId: string,
	userId: string,
	type: ModCase["type"],
	since: Date,
): Promise<ModCase | undefined> {
	return db.query.modCases.findFirst({
		where: and(
			eq(modCases.guildId, guildId),
			eq(modCases.userId, userId),
			eq(modCases.type, type),
			gte(modCases.createdAt, since),
		),
		orderBy: [desc(modCases.createdAt)],
	});
}
