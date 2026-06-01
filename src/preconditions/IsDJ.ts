import { AllFlowsPrecondition } from "@sapphire/framework";
import {
	type CommandInteraction,
	type ContextMenuCommandInteraction,
	type GuildMember,
	type Message,
	PermissionFlagsBits,
} from "discord.js";
import { BOT_OWNER_ID } from "../lib/constants.js";
import { getGuildSettingsCached } from "../lib/music/guildSettingsCache.js";

export async function isDJ(member: GuildMember, guildId: string): Promise<boolean> {
	if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
	if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
	const settings = await getGuildSettingsCached(guildId);
	if (settings?.djRoleId && member.roles.cache.has(settings.djRoleId)) return true;
	return false;
}

async function fetchInteractionMember(
	interaction: CommandInteraction | ContextMenuCommandInteraction,
): Promise<GuildMember | null> {
	if (!interaction.guild) return null;
	return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

export class IsDJPrecondition extends AllFlowsPrecondition {
	public override async messageRun(message: Message) {
		if (message.author.id === BOT_OWNER_ID) return this.ok();
		if (!message.member || !message.guild) return this.error({ message: "This command can only be used in a server." });
		return (await isDJ(message.member, message.guild.id))
			? this.ok()
			: this.error({ message: "You need the DJ role to use music commands." });
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		if (interaction.user.id === BOT_OWNER_ID) return this.ok();
		if (!interaction.guild) return this.error({ message: "This command can only be used in a server." });
		const member = await fetchInteractionMember(interaction);
		if (!member) return this.error({ message: "Could not find your member data." });
		return (await isDJ(member, interaction.guild.id))
			? this.ok()
			: this.error({ message: "You need the DJ role to use music commands." });
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (interaction.user.id === BOT_OWNER_ID) return this.ok();
		if (!interaction.guild) return this.error({ message: "This command can only be used in a server." });
		const member = await fetchInteractionMember(interaction);
		if (!member) return this.error({ message: "Could not find your member data." });
		return (await isDJ(member, interaction.guild.id))
			? this.ok()
			: this.error({ message: "You need the DJ role to use music commands." });
	}
}

declare module "@sapphire/framework" {
	interface Preconditions {
		IsDJ: never;
	}
}
