import { Listener, type UserError } from "@sapphire/framework";
import { type ChatInputSubcommandDeniedPayload, SubcommandPluginEvents } from "@sapphire/plugin-subcommands";
import { reportInteractionDenied } from "../../lib/interactionErrors.js";

export class SubcommandDeniedListener extends Listener<typeof SubcommandPluginEvents.ChatInputSubcommandDenied> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: SubcommandPluginEvents.ChatInputSubcommandDenied });
	}

	public async run(error: UserError, { interaction }: ChatInputSubcommandDeniedPayload): Promise<void> {
		await reportInteractionDenied(interaction, error.message);
	}
}
