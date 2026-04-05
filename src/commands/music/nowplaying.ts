import { Command } from "@sapphire/framework";
import { EmbedBuilder , MessageFlags } from "discord.js";
import { useQueue } from "discord-player";

export class NowPlayingCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("nowplaying").setDescription("Show the currently playing song"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue?.currentTrack) {
			return interaction.reply({ content: "Nothing is currently playing.", flags: MessageFlags.Ephemeral });
		}

		const track = queue.currentTrack;
		const progress = queue.node.createProgressBar();

		const embed = new EmbedBuilder()
			.setTitle("Now Playing")
			.setDescription(`**[${track.title}](${track.url})**\nby ${track.author}`)
			.setThumbnail(track.thumbnail)
			.setColor(0x1db954)
			.addFields(
				{ name: "Progress", value: progress ?? "Unknown" },
				{ name: "Requested by", value: `${track.requestedBy}`, inline: true },
				{ name: "Duration", value: track.duration, inline: true },
			);

		return interaction.reply({ embeds: [embed] });
	}
}
