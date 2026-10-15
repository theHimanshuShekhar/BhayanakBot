import { Command } from "@sapphire/framework";
import type { GuildTextBasedChannel } from "discord.js";
import { type GuildMember, MessageFlags, PermissionFlagsBits } from "discord.js";
import { QueryType, useMainPlayer } from "discord-player";
import { formatPlayerError } from "../../lib/music/errors.js";
import type { MusicQueueMetadata } from "../../lib/music/events.js";
import { getVoiceChannelRefusal, getYouTubeVideoId } from "../../lib/music/voiceChannel.js";

export class PlayCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly", "IsDJ"],
			help: {
				summary: "Play a song or playlist from a URL or search query.",
				examples: ["/play query:never gonna give you up", "/play query:https://youtu.be/dQw4w9WgXcQ"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("play")
				.setDescription("Play a song or playlist from a URL or search query")
				.addStringOption((opt) => opt.setName("query").setDescription("Song name or URL").setRequired(true)),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const member = interaction.member as GuildMember;
		const voiceChannel = member.voice.channel;

		if (!voiceChannel) {
			return interaction.reply({
				content: "You need to be in a voice channel to play music.",
				flags: MessageFlags.Ephemeral,
			});
		}

		// The bot idles anywhere; once it is connected, only members in its channel (or administrators) may queue.
		const refusal = getVoiceChannelRefusal(interaction.guild!, member);
		if (refusal) {
			return interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });
		}

		// Check bot has permission to join and speak
		const botPermissions = voiceChannel.permissionsFor(interaction.guild!.members.me!);
		if (!botPermissions?.has(PermissionFlagsBits.Connect)) {
			return interaction.reply({
				content: "I don't have permission to join your voice channel.",
				flags: MessageFlags.Ephemeral,
			});
		}
		if (!botPermissions.has(PermissionFlagsBits.Speak)) {
			return interaction.reply({
				content: "I don't have permission to speak in your voice channel.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const query = interaction.options.getString("query", true);
		const player = useMainPlayer();
		// Pre-search workaround is still needed in discord-player v7 to avoid SoundCloud fallback. Searching the bare
		// video URL (not the pasted one) keeps a `list=` playlist parameter from turning it into a playlist request.
		const ytVideoId = getYouTubeVideoId(query);
		const isYTVideo = ytVideoId !== null;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			let finalQuery = query;

			// For YouTube single-video URLs, pre-search to get title/author and re-query
			// via YOUTUBE_SEARCH to avoid discord-player v7 falling back to SoundCloud.
			if (isYTVideo) {
				const ytResult = await player.search(`https://www.youtube.com/watch?v=${ytVideoId}`, {
					requestedBy: interaction.user,
				});
				if (!ytResult.hasTracks()) {
					return interaction.editReply({
						content: "Could not retrieve YouTube video info. Try searching by song name instead.",
					});
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
