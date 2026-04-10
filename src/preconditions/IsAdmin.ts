import { AllFlowsPrecondition } from "@sapphire/framework";
import { PermissionFlagsBits, type CommandInteraction, type ContextMenuCommandInteraction, type Message } from "discord.js";
import { BOT_OWNER_ID } from "../lib/constants.js";

export class IsAdminPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		if (message.author.id === BOT_OWNER_ID) return this.ok();
		return message.member?.permissions.has(PermissionFlagsBits.Administrator)
			? this.ok()
			: this.error({ message: "You need Administrator permission to use this command." });
	}

	public override chatInputRun(interaction: CommandInteraction) {
		if (interaction.user.id === BOT_OWNER_ID) return this.ok();
		const member = interaction.guild?.members.cache.get(interaction.user.id);
		return member?.permissions.has(PermissionFlagsBits.Administrator)
			? this.ok()
			: this.error({ message: "You need Administrator permission to use this command." });
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (interaction.user.id === BOT_OWNER_ID) return this.ok();
		const member = interaction.guild?.members.cache.get(interaction.user.id);
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
