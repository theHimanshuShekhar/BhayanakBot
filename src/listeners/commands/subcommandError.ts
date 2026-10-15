import { Listener } from "@sapphire/framework";
import { type ChatInputSubcommandErrorPayload, SubcommandPluginEvents } from "@sapphire/plugin-subcommands";
import { reportInteractionError } from "../../lib/interactionErrors.js";

export class SubcommandErrorListener extends Listener<typeof SubcommandPluginEvents.ChatInputSubcommandError> {
	// Named like the built-in listener so it replaces it; otherwise each error would be logged twice.
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			name: "PluginChatInputSubcommandError",
			event: SubcommandPluginEvents.ChatInputSubcommandError,
		});
	}

	public async run(error: unknown, { interaction, command }: ChatInputSubcommandErrorPayload): Promise<void> {
		await reportInteractionError(interaction, error, `chat input subcommand "${command.name}"`);
	}
}
