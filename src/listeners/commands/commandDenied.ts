import { type ChatInputCommandDeniedPayload, Events, Listener, type UserError } from "@sapphire/framework";
import { reportInteractionDenied } from "../../lib/interactionErrors.js";

export class CommandDeniedListener extends Listener<typeof Events.ChatInputCommandDenied> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.ChatInputCommandDenied });
	}

	public async run(error: UserError, { interaction }: ChatInputCommandDeniedPayload): Promise<void> {
		await reportInteractionDenied(interaction, error.message);
	}
}
