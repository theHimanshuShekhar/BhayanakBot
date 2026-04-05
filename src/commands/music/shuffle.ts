import { Command } from "@sapphire/framework";
import { useQueue } from "discord-player";

export class ShuffleCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly", "IsDJ"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("shuffle").setDescription("Shuffle the music queue"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue || queue.tracks.size === 0) {
			return interaction.reply({ content: "The queue is empty.", ephemeral: true });
		}

		queue.tracks.shuffle();
		return interaction.reply({ content: `Shuffled **${queue.tracks.size}** track(s).` });
	}
}
