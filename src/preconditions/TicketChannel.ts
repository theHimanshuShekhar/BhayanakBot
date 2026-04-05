import { AllFlowsPrecondition } from "@sapphire/framework";
import type { CommandInteraction, ContextMenuCommandInteraction, Message } from "discord.js";
import { db } from "../lib/database.js";
import { tickets } from "../db/schema.js";
import { and, eq } from "drizzle-orm";

async function isTicketChannel(channelId: string): Promise<boolean> {
	const ticket = await db.query.tickets.findFirst({
		where: and(eq(tickets.channelId, channelId), eq(tickets.status, "open")),
	});
	return Boolean(ticket);
}

export class TicketChannelPrecondition extends AllFlowsPrecondition {
	public override async messageRun(message: Message) {
		return (await isTicketChannel(message.channel.id))
			? this.ok()
			: this.error({ message: "This command can only be used inside a ticket channel." });
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		return (await isTicketChannel(interaction.channel?.id ?? ""))
			? this.ok()
			: this.error({ message: "This command can only be used inside a ticket channel." });
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return (await isTicketChannel(interaction.channel?.id ?? ""))
			? this.ok()
			: this.error({ message: "This command can only be used inside a ticket channel." });
	}
}

declare module "@sapphire/framework" {
	interface Preconditions {
		TicketChannel: never;
	}
}
