import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";

const responses = [
	"It is certain.",
	"It is decidedly so.",
	"Without a doubt.",
	"Yes, definitely.",
	"You may rely on it.",
	"As I see it, yes.",
	"Most likely.",
	"Outlook good.",
	"Yes.",
	"Signs point to yes.",
	"Reply hazy, try again.",
	"Ask again later.",
	"Better not tell you now.",
	"Cannot predict now.",
	"Concentrate and ask again.",
	"Don't count on it.",
	"My reply is no.",
	"My sources say no.",
	"Outlook not so good.",
	"Very doubtful.",
];

export class EightBallCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("8ball")
				.setDescription("Ask the magic 8-ball a yes/no question")
				.addStringOption((opt) =>
					opt.setName("question").setDescription("Your question").setRequired(true),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const question = interaction.options.getString("question", true);
		const answer = responses[Math.floor(Math.random() * responses.length)];

		const embed = new EmbedBuilder()
			.setTitle("🎱 Magic 8-Ball")
			.addFields(
				{ name: "Question", value: question },
				{ name: "Answer", value: answer },
			)
			.setColor(0x000000);

		return interaction.reply({ embeds: [embed] });
	}
}
