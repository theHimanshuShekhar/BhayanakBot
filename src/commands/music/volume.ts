import { MessageFlags } from "discord.js";
import { Command } from "@sapphire/framework";
import { useQueue } from "discord-player";

export class VolumeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly", "IsDJ"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("volume")
				.setDescription("Set the music volume")
				.addIntegerOption((opt) =>
					opt.setName("level").setDescription("Volume level (0-100)").setMinValue(0).setMaxValue(100).setRequired(true),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue?.isPlaying()) {
			return interaction.reply({ content: "Nothing is playing.", flags: MessageFlags.Ephemeral });
		}

		const level = interaction.options.getInteger("level", true);
		queue.node.setVolume(level);
		return interaction.reply({ content: `Volume set to **${level}%**.` });
	}
}
