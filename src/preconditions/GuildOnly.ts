import { AllFlowsPrecondition } from "@sapphire/framework";
import type { CommandInteraction, ContextMenuCommandInteraction, Message } from "discord.js";

export class GuildOnlyPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		return message.guild ? this.ok() : this.error({ message: "This command can only be used in a server." });
	}

	public override chatInputRun(interaction: CommandInteraction) {
		return interaction.guild ? this.ok() : this.error({ message: "This command can only be used in a server." });
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return interaction.guild ? this.ok() : this.error({ message: "This command can only be used in a server." });
	}
}

declare module "@sapphire/framework" {
	interface Preconditions {
		GuildOnly: never;
	}
}
