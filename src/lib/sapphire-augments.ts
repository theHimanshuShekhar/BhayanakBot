import type { CommandHelp } from "./help/types.js";

declare module "@sapphire/framework" {
	interface CommandOptions {
		help?: CommandHelp;
	}
}

export {};
