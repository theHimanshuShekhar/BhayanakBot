import { EmbedBuilder } from "discord.js";
import { QueueRepeatMode } from "discord-player";
import type { GuildQueue, Track } from "discord-player";

const REPEAT_LABELS: Partial<Record<QueueRepeatMode, string>> = {
	[QueueRepeatMode.OFF]: "Off",
	[QueueRepeatMode.TRACK]: "Track",
	[QueueRepeatMode.QUEUE]: "Queue",
	[QueueRepeatMode.AUTOPLAY]: "Autoplay",
};

export const QUEUE_PAGE_SIZE = 10;

export function buildNowPlayingEmbed(queue: GuildQueue, track: Track): EmbedBuilder {
	const progress = queue.node.createProgressBar() ?? "Unknown";
	const repeatLabel = REPEAT_LABELS[queue.repeatMode] ?? "Off";

	return new EmbedBuilder()
		.setTitle("Now Playing")
		.setDescription(`**[${track.title}](${track.url})**\nby ${track.author}`)
		.setThumbnail(track.thumbnail)
		.setColor(0x1db954)
		.addFields(
			{ name: "Progress", value: progress },
			{ name: "Requested by", value: `${track.requestedBy ?? "Unknown"}`, inline: true },
			{ name: "Duration", value: track.duration, inline: true },
			{ name: "Loop", value: repeatLabel, inline: true },
		);
}

export function buildQueueEmbed(queue: GuildQueue, page: number): EmbedBuilder {
	const tracks = queue.tracks.toArray();
	const totalPages = Math.max(1, Math.ceil(tracks.length / QUEUE_PAGE_SIZE));
	const clampedPage = Math.min(Math.max(1, page), totalPages);

	const pageTracks = tracks.slice((clampedPage - 1) * QUEUE_PAGE_SIZE, clampedPage * QUEUE_PAGE_SIZE);

	const lines = pageTracks.map(
		(t, i) => `${(clampedPage - 1) * QUEUE_PAGE_SIZE + i + 1}. **${t.title}** — ${t.author} \`${t.duration}\``,
	);

	const embed = new EmbedBuilder()
		.setTitle("Music Queue")
		.setColor(0x5865f2)
		.setFooter({ text: `Page ${clampedPage}/${totalPages} · ${tracks.length} track(s) in queue` });

	if (queue.currentTrack) {
		embed.addFields({
			name: "Now Playing",
			value: `**${queue.currentTrack.title}** — ${queue.currentTrack.author}`,
		});
	}

	embed.addFields({
		name: "Up Next",
		value: lines.length > 0 ? lines.join("\n") : "No more tracks queued.",
	});

	return embed;
}
