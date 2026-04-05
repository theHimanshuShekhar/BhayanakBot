import { container } from "@sapphire/framework";
import type { GuildTextBasedChannel, TextChannel } from "discord.js";
import type { Player, GuildQueue, Track } from "discord-player";
import { buildNowPlayingEmbed } from "./embeds.js";
import { buildNowPlayingButtons, buildDisabledNowPlayingButtons } from "./components.js";
import { formatPlayerError } from "./errors.js";

export interface MusicQueueMetadata {
	channel: GuildTextBasedChannel;
	nowPlayingMessageId?: string;
}

function getMeta(queue: GuildQueue): MusicQueueMetadata | null {
	const meta = queue.metadata as MusicQueueMetadata | null | undefined;
	if (!meta || !("channel" in meta)) return null;
	return meta;
}

async function disableNowPlayingMessage(meta: MusicQueueMetadata): Promise<void> {
	if (!meta.nowPlayingMessageId) return;
	const ch = meta.channel;
	if (!("messages" in ch)) return;
	try {
		const msg = await (ch as unknown as TextChannel).messages.fetch(meta.nowPlayingMessageId).catch(() => null);
		if (msg?.editable) await msg.edit({ components: [buildDisabledNowPlayingButtons()] });
	} catch {
		// Message may have been deleted — ignore
	}
}

export function registerPlayerEvents(player: Player): void {
	player.events.on("playerStart", async (queue: GuildQueue, track: Track) => {
		const meta = getMeta(queue);
		if (!meta?.channel) return;

		// Disable buttons on the previous now-playing message before posting a new one
		await disableNowPlayingMessage(meta);

		try {
			const embed = buildNowPlayingEmbed(queue, track);
			const row = buildNowPlayingButtons(queue);
			const msg = await meta.channel.send({ embeds: [embed], components: [row] });
			(queue.metadata as MusicQueueMetadata).nowPlayingMessageId = msg.id;
		} catch (err) {
			container.logger.error("[Music:playerStart] Failed to post now-playing card:", err);
		}
	});

	player.events.on("emptyQueue", async (queue: GuildQueue) => {
		const meta = getMeta(queue);
		if (!meta?.channel) return;

		await disableNowPlayingMessage(meta);

		try {
			await meta.channel.send({ content: "Queue finished. Add more songs with `/play`!" });
		} catch (err) {
			container.logger.error("[Music:emptyQueue] Failed to send queue-end message:", err);
		}
	});

	player.events.on("playerError", async (queue: GuildQueue, error: Error, track: Track) => {
		container.logger.error(`[Music:playerError] track="${track?.title}"`, error);
		const meta = getMeta(queue);
		if (!meta?.channel) return;
		try {
			await meta.channel.send({ content: `Playback error on **${track?.title ?? "unknown track"}**: ${formatPlayerError(error)}` });
		} catch (err) {
			container.logger.error("[Music:playerError] Failed to send error message:", err);
		}
	});

	player.events.on("error", async (queue: GuildQueue, error: Error) => {
		container.logger.error("[Music:error]", error);
		const meta = getMeta(queue);
		if (!meta?.channel) return;
		try {
			await meta.channel.send({ content: `An error occurred: ${formatPlayerError(error)}` });
		} catch (err) {
			container.logger.error("[Music:error] Failed to send error message:", err);
		}
	});

	player.events.on("disconnect", async (queue: GuildQueue) => {
		container.logger.debug("[Music:disconnect] Bot disconnected from voice");
		const meta = getMeta(queue);
		if (!meta) return;
		await disableNowPlayingMessage(meta);
	});
}
