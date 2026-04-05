import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { QueueRepeatMode } from "discord-player";
import type { GuildQueue } from "discord-player";
import { QUEUE_PAGE_SIZE } from "./embeds.js";

const LOOP_LABELS: Partial<Record<QueueRepeatMode, string>> = {
	[QueueRepeatMode.OFF]: "Loop: Off",
	[QueueRepeatMode.TRACK]: "Loop: Track",
	[QueueRepeatMode.QUEUE]: "Loop: Queue",
};

export function buildNowPlayingButtons(queue: GuildQueue): ActionRowBuilder<ButtonBuilder> {
	const isPaused = queue.node.isPaused();
	const hasHistory = queue.history.tracks.toArray().length > 0;
	const repeatLabel = LOOP_LABELS[queue.repeatMode] ?? "Loop: Off";

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("music:previous")
			.setEmoji("⏮")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(!hasHistory),
		new ButtonBuilder()
			.setCustomId("music:playpause")
			.setEmoji(isPaused ? "▶️" : "⏸")
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId("music:skip").setEmoji("⏭").setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId("music:loop").setLabel(repeatLabel).setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId("music:stop").setEmoji("⏹").setStyle(ButtonStyle.Danger),
	);
}

export function buildDisabledNowPlayingButtons(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("music:previous")
			.setEmoji("⏮")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId("music:playpause")
			.setEmoji("▶️")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(true),
		new ButtonBuilder().setCustomId("music:skip").setEmoji("⏭").setStyle(ButtonStyle.Secondary).setDisabled(true),
		new ButtonBuilder()
			.setCustomId("music:loop")
			.setLabel("Loop: Off")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder().setCustomId("music:stop").setEmoji("⏹").setStyle(ButtonStyle.Danger).setDisabled(true),
	);
}

export function buildQueuePageButtons(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`music:queue:prev:${page}`)
			.setEmoji("◀")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 1),
		new ButtonBuilder()
			.setCustomId(`music:queue:next:${page}`)
			.setEmoji("▶")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= totalPages),
	);
}

export { QUEUE_PAGE_SIZE };
