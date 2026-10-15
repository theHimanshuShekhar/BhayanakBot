import type { InteractionHandlerParseError } from "@sapphire/framework";
import { Events, Listener } from "@sapphire/framework";
import { reportInteractionError } from "../../lib/interactionErrors.js";

export class InteractionHandlerParseErrorListener extends Listener<typeof Events.InteractionHandlerParseError> {
	// Named like the built-in listener so it replaces it; otherwise each error would be logged twice.
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			name: "CoreInteractionHandlerParseError",
			event: Events.InteractionHandlerParseError,
		});
	}

	public async run(error: unknown, { interaction, handler }: InteractionHandlerParseError): Promise<void> {
		await reportInteractionError(interaction, error, `interaction handler "${handler.name}" parse`);
	}
}
