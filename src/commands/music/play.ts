import { Command } from "@sapphire/framework";
import { EmbedBuilder, GuildMember } from "discord.js";
import { useMainPlayer, QueryType } from "discord-player";

/** Matches YouTube single-video URLs (not playlists) */
function isYouTubeVideoUrl(query: string): boolean {
	return /(youtube\.com\/watch\?v=|youtu\.be\/)/.test(query);
}

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
		const isYTVideo = isYouTubeVideoUrl(query);

		await interaction.deferReply();

		try {
			let finalQuery = query;

			// For YouTube single-video URLs, pre-search to get title/author and re-query
			// via YOUTUBE_SEARCH to avoid discord-player falling back to SoundCloud.
			if (isYTVideo) {
				const ytResult = await player.search(query, { requestedBy: interaction.user });
				if (!ytResult.hasTracks()) {
					return interaction.editReply({
						content: "Could not retrieve YouTube video info. Try searching by song name instead.",
					});
				}
				const ytTrack = ytResult.tracks[0];
				finalQuery = `${ytTrack.title} ${ytTrack.author}`;
			}

			const { track, searchResult } = await player.play(voiceChannel, finalQuery, {
				searchEngine: isYTVideo ? QueryType.YOUTUBE_SEARCH : undefined,
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

			if (searchResult.hasPlaylist() && searchResult.playlist) {
				const playlist = searchResult.playlist;
				const tracks = searchResult.tracks;
				const isSpotify = query.includes("open.spotify.com");
				const color = isSpotify ? 0x1db954 : 0xff0000;

				const trackList = tracks
					.slice(0, 5)
					.map((t, i) => `${i + 1}. **${t.title}** — ${t.author}`)
					.join("\n");

				const embed = new EmbedBuilder()
					.setColor(color)
					.setTitle(playlist.title)
					.setURL(playlist.url || null)
					.setDescription(trackList)
					.setFooter({
						text: `Queued by ${interaction.user.username} · ${tracks.length} tracks`,
					});

				return interaction.editReply({ embeds: [embed] });
			}

			return interaction.editReply({ content: `Queued: **${track.title}** by **${track.author}**` });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return interaction.editReply({ content: `Failed to play: ${message}` });
		}
	}
}
