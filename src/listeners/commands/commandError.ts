import { type ChatInputCommandErrorPayload, Events, Listener } from "@sapphire/framework";
import { reportInteractionError } from "../../lib/interactionErrors.js";

export class CommandErrorListener extends Listener<typeof Events.ChatInputCommandError> {
	// Named like the built-in listener so it replaces it; otherwise each error would be logged twice.
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, name: "CoreChatInputCommandError", event: Events.ChatInputCommandError });
	}

	public async run(error: unknown, { interaction, command }: ChatInputCommandErrorPayload): Promise<void> {
		await reportInteractionError(interaction, error, `chat input command "${command.name}"`);
	}
}
