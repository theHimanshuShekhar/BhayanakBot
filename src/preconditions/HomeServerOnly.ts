import { AllFlowsPrecondition } from "@sapphire/framework";
import type { CommandInteraction, ContextMenuCommandInteraction, Message } from "discord.js";
import { isHomeServer } from "../lib/homeServer.js";

const DENIED = { message: "This command is only available in the Bhayanak server." };

export class HomeServerOnlyPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		return isHomeServer(message.guildId) ? this.ok() : this.error(DENIED);
	}

	public override chatInputRun(interaction: CommandInteraction) {
		return isHomeServer(interaction.guildId) ? this.ok() : this.error(DENIED);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return isHomeServer(interaction.guildId) ? this.ok() : this.error(DENIED);
	}
}

declare module "@sapphire/framework" {
	interface Preconditions {
		HomeServerOnly: never;
	}
}
