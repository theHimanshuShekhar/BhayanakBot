import { AllFlowsPrecondition } from "@sapphire/framework";
import {
	type CommandInteraction,
	type ContextMenuCommandInteraction,
	type Message,
	PermissionFlagsBits,
} from "discord.js";
import { BOT_OWNER_ID } from "../lib/constants.js";

export class IsAdminPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		if (message.author.id === BOT_OWNER_ID) return this.ok();
		return message.member?.permissions.has(PermissionFlagsBits.Administrator)
			? this.ok()
			: this.error({ message: "You need Administrator permission to use this command." });
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		if (interaction.user.id === BOT_OWNER_ID) return this.ok();
		if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return this.ok();
		const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
		return member?.permissions.has(PermissionFlagsBits.Administrator)
			? this.ok()
			: this.error({ message: "You need Administrator permission to use this command." });
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (interaction.user.id === BOT_OWNER_ID) return this.ok();
		if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return this.ok();
		const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
		return member?.permissions.has(PermissionFlagsBits.Administrator)
			? this.ok()
			: this.error({ message: "You need Administrator permission to use this command." });
	}
}

declare module "@sapphire/framework" {
	interface Preconditions {
		IsAdmin: never;
	}
}
