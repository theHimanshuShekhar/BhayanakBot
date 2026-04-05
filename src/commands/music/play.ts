import { Command } from "@sapphire/framework";
import { GuildMember, MessageFlags, PermissionFlagsBits } from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { useMainPlayer, QueryType } from "discord-player";
import { formatPlayerError } from "../../lib/music/errors.js";
import type { MusicQueueMetadata } from "../../lib/music/events.js";

/** Matches YouTube single-video URLs (not playlists). Pre-search workaround
 *  is still needed in discord-player v7 to avoid SoundCloud fallback. */
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
			return interaction.reply({ content: "You need to be in a voice channel to play music.", flags: MessageFlags.Ephemeral });
		}

		// Check bot has permission to join and speak
		const botPermissions = voiceChannel.permissionsFor(interaction.guild!.members.me!);
		if (!botPermissions?.has(PermissionFlagsBits.Connect)) {
			return interaction.reply({ content: "I don't have permission to join your voice channel.", flags: MessageFlags.Ephemeral });
		}
		if (!botPermissions.has(PermissionFlagsBits.Speak)) {
			return interaction.reply({ content: "I don't have permission to speak in your voice channel.", flags: MessageFlags.Ephemeral });
		}

		const query = interaction.options.getString("query", true);
		const player = useMainPlayer();
		const isYTVideo = isYouTubeVideoUrl(query);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			let finalQuery = query;

			// For YouTube single-video URLs, pre-search to get title/author and re-query
			// via YOUTUBE_SEARCH to avoid discord-player v7 falling back to SoundCloud.
			if (isYTVideo) {
				const ytResult = await player.search(query, { requestedBy: interaction.user });
				if (!ytResult.hasTracks()) {
					return interaction.editReply({ content: "Could not retrieve YouTube video info. Try searching by song name instead." });
				}
				const ytTrack = ytResult.tracks[0];
				finalQuery = `${ytTrack.title} ${ytTrack.author}`;
			}

			const metadata: MusicQueueMetadata = { channel: interaction.channel as GuildTextBasedChannel };

			const { track, searchResult } = await player.play(voiceChannel, finalQuery, {
				searchEngine: isYTVideo ? QueryType.YOUTUBE_SEARCH : undefined,
				nodeOptions: {
					metadata,
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
				const trackCount = searchResult.tracks.length;
				return interaction.editReply({
					content: `Queued **${trackCount} track${trackCount === 1 ? "" : "s"}** from **${playlist.title}**.`,
				});
			}

			return interaction.editReply({ content: `Queued: **${track.title}** by **${track.author}**` });
		} catch (error) {
			return interaction.editReply({ content: `Failed to play: ${formatPlayerError(error)}` });
		}
	}
}
