import { Command } from "@sapphire/framework";

export class ChooseCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("choose")
				.setDescription("Let the bot choose from a list of options (separate with commas)")
				.addStringOption((opt) =>
					opt.setName("options").setDescription("Options separated by commas (e.g. pizza, sushi, tacos)").setRequired(true),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const raw = interaction.options.getString("options", true);
		const options = raw
			.split(",")
			.map((o) => o.trim())
			.filter(Boolean);

		if (options.length < 2) {
			return interaction.reply({ content: "Please provide at least 2 options.", ephemeral: true });
		}

		const chosen = options[Math.floor(Math.random() * options.length)];
		return interaction.reply({ content: `🎲 I choose: **${chosen}**` });
	}
}
