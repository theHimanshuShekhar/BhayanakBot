import { AllFlowsPrecondition } from "@sapphire/framework";
import { PermissionFlagsBits, type CommandInteraction, type ContextMenuCommandInteraction, type Message } from "discord.js";

export class IsAdminPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		return message.member?.permissions.has(PermissionFlagsBits.Administrator)
			? this.ok()
			: this.error({ message: "You need Administrator permission to use this command." });
	}

	public override chatInputRun(interaction: CommandInteraction) {
		const member = interaction.guild?.members.cache.get(interaction.user.id);
		return member?.permissions.has(PermissionFlagsBits.Administrator)
			? this.ok()
			: this.error({ message: "You need Administrator permission to use this command." });
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
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
