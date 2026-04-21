import { Command } from "@sapphire/framework";

export class CoinflipCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "Flip a coin — heads or tails.",
				examples: ["/coinflip"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("coinflip").setDescription("Flip a coin — heads or tails?"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const result = Math.random() < 0.5 ? "🪙 Heads!" : "🪙 Tails!";
		return interaction.reply({ content: result });
	}
}
