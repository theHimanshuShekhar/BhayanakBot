import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";

export class PingCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			help: {
				summary: "Check bot latency and API response time.",
				examples: ["/ping"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("ping").setDescription("Check bot latency and API response time"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
		const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
		const ws = this.container.client.ws.ping;

		const embed = new EmbedBuilder()
			.setTitle("🏓 Pong!")
			.addFields(
				{ name: "Roundtrip", value: `${roundtrip}ms`, inline: true },
				{ name: "WebSocket", value: `${ws}ms`, inline: true },
			)
			.setColor(0x57f287);

		return interaction.editReply({ content: null, embeds: [embed] });
	}
}
