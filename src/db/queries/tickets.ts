import { and, eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { tickets } from "../schema.js";

export type Ticket = typeof tickets.$inferSelect;

export async function createTicket(data: { channelId: string; userId: string; guildId: string; subject?: string }): Promise<Ticket> {
	const [ticket] = await db.insert(tickets).values(data).returning();
	return ticket;
}

export async function getTicketByChannel(channelId: string): Promise<Ticket | undefined> {
	return db.query.tickets.findFirst({ where: eq(tickets.channelId, channelId) });
}

export async function claimTicket(channelId: string, moderatorId: string): Promise<void> {
	await db.update(tickets).set({ claimedBy: moderatorId, claimedAt: new Date() }).where(eq(tickets.channelId, channelId));
}

export async function closeTicket(channelId: string, closedBy: string, transcriptUrl?: string): Promise<void> {
	await db
		.update(tickets)
		.set({ status: "closed", closedBy, closedAt: new Date(), transcriptUrl })
		.where(eq(tickets.channelId, channelId));
}

export async function getUserOpenTickets(userId: string, guildId: string): Promise<Ticket[]> {
	return db.query.tickets.findMany({
		where: and(eq(tickets.userId, userId), eq(tickets.guildId, guildId), eq(tickets.status, "open")),
	});
}
