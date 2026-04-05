import { Command } from "@sapphire/framework";
import { GuildMember } from "discord.js";
import { useMainPlayer } from "discord-player";

export class PlayCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly", "IsDJ"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("play")
				.setDescription("Play a song or playlist from a URL or search query")
				.addStringOption((opt) =>
					opt.setName("query").setDescription("Song name or URL").setRequired(true),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const member = interaction.member as GuildMember;
		const voiceChannel = member.voice.channel;

		if (!voiceChannel) {
			return interaction.reply({ content: "You need to be in a voice channel to play music.", ephemeral: true });
		}

		const query = interaction.options.getString("query", true);
		const player = useMainPlayer();

		await interaction.deferReply();

		try {
			const { track } = await player.play(voiceChannel, query, {
				nodeOptions: {
					metadata: {
						channel: interaction.channel,
						requestedBy: interaction.user,
					},
					selfDeaf: true,
					volume: 80,
					leaveOnEmpty: true,
					leaveOnEmptyCooldown: 30_000,
					leaveOnEnd: true,
					leaveOnEndCooldown: 30_000,
				},
				requestedBy: interaction.user,
			});

			return interaction.editReply({ content: `Queued: **${track.title}** by **${track.author}**` });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return interaction.editReply({ content: `Failed to play: ${message}` });
		}
	}
}
