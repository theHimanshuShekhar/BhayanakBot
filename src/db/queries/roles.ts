import { and, eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { reactionRoles, roleMenus, roleMenuOptions } from "../schema.js";

export type ReactionRole = typeof reactionRoles.$inferSelect;
export type RoleMenu = typeof roleMenus.$inferSelect;
export type RoleMenuOption = typeof roleMenuOptions.$inferSelect;

// --- Reaction Roles ---

export async function addReactionRole(data: {
	messageId: string;
	emoji: string;
	roleId: string;
	guildId: string;
	type?: "normal" | "toggle" | "unique";
	groupId?: string;
}): Promise<void> {
	await db.insert(reactionRoles).values(data).onConflictDoNothing();
}

export async function removeReactionRole(messageId: string, emoji: string): Promise<void> {
	await db
		.delete(reactionRoles)
		.where(and(eq(reactionRoles.messageId, messageId), eq(reactionRoles.emoji, emoji)));
}

export async function getReactionRole(messageId: string, emoji: string): Promise<ReactionRole | undefined> {
	return db.query.reactionRoles.findFirst({
		where: and(eq(reactionRoles.messageId, messageId), eq(reactionRoles.emoji, emoji)),
	});
}

export async function getMessageReactionRoles(messageId: string): Promise<ReactionRole[]> {
	return db.query.reactionRoles.findMany({ where: eq(reactionRoles.messageId, messageId) });
}

// --- Role Menus ---

export async function createRoleMenu(data: {
	messageId: string;
	channelId: string;
	guildId: string;
	placeholder?: string;
	minValues?: number;
	maxValues?: number;
}): Promise<RoleMenu> {
	const [menu] = await db.insert(roleMenus).values(data).returning();
	return menu;
}

export async function getRoleMenu(messageId: string): Promise<RoleMenu | undefined> {
	return db.query.roleMenus.findFirst({ where: eq(roleMenus.messageId, messageId) });
}

export async function deleteRoleMenu(messageId: string): Promise<void> {
	const menu = await getRoleMenu(messageId);
	if (!menu) return;
	await db.delete(roleMenuOptions).where(eq(roleMenuOptions.menuId, menu.id));
	await db.delete(roleMenus).where(eq(roleMenus.messageId, messageId));
}

export async function addRoleMenuOption(data: {
	menuId: number;
	roleId: string;
	label: string;
	description?: string;
	emoji?: string;
}): Promise<RoleMenuOption> {
	const [option] = await db.insert(roleMenuOptions).values(data).returning();
	return option;
}

export async function getRoleMenuOptions(menuId: number): Promise<RoleMenuOption[]> {
	return db.query.roleMenuOptions.findMany({ where: eq(roleMenuOptions.menuId, menuId) });
}
