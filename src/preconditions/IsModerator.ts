import { AllFlowsPrecondition } from "@sapphire/framework";
import {
	type CommandInteraction,
	type ContextMenuCommandInteraction,
	type GuildMember,
	type Message,
	PermissionFlagsBits,
} from "discord.js";
import { eq } from "drizzle-orm";
import { guildSettings } from "../db/schema.js";
import { BOT_OWNER_ID } from "../lib/constants.js";
import { db } from "../lib/database.js";

async function isMod(member: GuildMember, guildId: string): Promise<boolean> {
	if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
	if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
	const settings = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
	if (settings?.moderatorRoleId && member.roles.cache.has(settings.moderatorRoleId)) return true;
	return false;
}

async function fetchInteractionMember(
	interaction: CommandInteraction | ContextMenuCommandInteraction,
): Promise<GuildMember | null> {
	if (!interaction.guild) return null;
	return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

export class IsModeratorPrecondition extends AllFlowsPrecondition {
	public override async messageRun(message: Message) {
		if (message.author.id === BOT_OWNER_ID) return this.ok();
		if (!message.member || !message.guild) return this.error({ message: "This command can only be used in a server." });
		return (await isMod(message.member, message.guild.id))
			? this.ok()
			: this.error({ message: "You need to be a moderator to use this command." });
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		if (interaction.user.id === BOT_OWNER_ID) return this.ok();
		if (!interaction.guild) return this.error({ message: "This command can only be used in a server." });
		const member = await fetchInteractionMember(interaction);
		if (!member) return this.error({ message: "Could not find your member data." });
		return (await isMod(member, interaction.guild.id))
			? this.ok()
			: this.error({ message: "You need to be a moderator to use this command." });
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (interaction.user.id === BOT_OWNER_ID) return this.ok();
		if (!interaction.guild) return this.error({ message: "This command can only be used in a server." });
		const member = await fetchInteractionMember(interaction);
		if (!member) return this.error({ message: "Could not find your member data." });
		return (await isMod(member, interaction.guild.id))
			? this.ok()
			: this.error({ message: "You need to be a moderator to use this command." });
	}
}

declare module "@sapphire/framework" {
	interface Preconditions {
		IsModerator: never;
	}
}
