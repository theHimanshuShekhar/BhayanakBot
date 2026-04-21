export interface SubcommandHelp {
	summary: string;
	examples: string[];
}

export interface CommandHelp {
	summary: string;
	examples: string[];
	usageNotes?: string;
	subcommands?: Record<string, SubcommandHelp>;
}

export interface CategoryMeta {
	id: string;
	label: string;
	emoji: string;
	description: string;
}
