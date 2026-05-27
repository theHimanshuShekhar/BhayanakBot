import { Events, Listener } from "@sapphire/framework";
import { incrementCommandsRun } from "../../db/queries/publicStats.js";

export class CommandSuccessListener extends Listener<typeof Events.ChatInputCommandSuccess> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.ChatInputCommandSuccess });
	}

	public async run(): Promise<void> {
		try {
			await incrementCommandsRun();
		} catch (error) {
			this.container.logger.error("[public-stats] Failed to increment command counter:", error);
		}
	}
}
