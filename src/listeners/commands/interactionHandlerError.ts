import type { InteractionHandlerError } from "@sapphire/framework";
import { Events, Listener } from "@sapphire/framework";
import { reportInteractionError } from "../../lib/interactionErrors.js";

export class InteractionHandlerErrorListener extends Listener<typeof Events.InteractionHandlerError> {
	// Named like the built-in listener so it replaces it; otherwise each error would be logged twice.
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, name: "CoreInteractionHandlerError", event: Events.InteractionHandlerError });
	}

	public async run(error: unknown, { interaction, handler }: InteractionHandlerError): Promise<void> {
		await reportInteractionError(interaction, error, `interaction handler "${handler.name}"`);
	}
}
