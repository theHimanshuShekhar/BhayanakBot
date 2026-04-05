import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { modCases } from "../schema.js";

export type ModCase = typeof modCases.$inferSelect;
export type ModCaseInsert = typeof modCases.$inferInsert;

async function getNextCaseNumber(guildId: string): Promise<number> {
	const result = await db
		.select({ max: sql<number>`COALESCE(MAX(case_number), 0)` })
		.from(modCases)
		.where(eq(modCases.guildId, guildId));
	return (result[0]?.max ?? 0) + 1;
}

export async function createCase(data: Omit<ModCaseInsert, "caseNumber" | "id">): Promise<ModCase> {
	const caseNumber = await getNextCaseNumber(data.guildId);
	const [created] = await db.insert(modCases).values({ ...data, caseNumber }).returning();
	return created;
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
