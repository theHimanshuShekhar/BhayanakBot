import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import type { ButtonInteraction, GuildMember } from "discord.js";
import { useQueue, QueueRepeatMode } from "discord-player";
import type { GuildQueue } from "discord-player";
import { getGuildSettingsCached } from "../lib/music/guildSettingsCache.js";
import { buildNowPlayingEmbed, buildQueueEmbed, QUEUE_PAGE_SIZE } from "../lib/music/embeds.js";
import { buildNowPlayingButtons, buildDisabledNowPlayingButtons, buildQueuePageButtons } from "../lib/music/components.js";

async function checkDJ(interaction: ButtonInteraction): Promise<boolean> {
	const member = interaction.member as GuildMember;
	if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
	if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
	const settings = await getGuildSettingsCached(interaction.guildId!);
	if (settings?.djRoleId && member.roles.cache.has(settings.djRoleId)) return true;
	return false;
}

export class MusicButtonsHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith("music:")) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const customId = interaction.customId;

		// Queue pagination — no DJ check needed
		if (customId.startsWith("music:queue:")) {
			return this.handleQueuePage(interaction);
		}

		if (!(await checkDJ(interaction))) {
			return interaction.reply({ content: "You need the DJ role to control music.", flags: MessageFlags.Ephemeral });
		}

		const queue = useQueue(interaction.guildId!);
		if (!queue) {
			return interaction.reply({ content: "Nothing is playing.", flags: MessageFlags.Ephemeral });
		}

		switch (customId) {
			case "music:playpause":
				return this.handlePlayPause(interaction, queue);
			case "music:skip":
				return this.handleSkip(interaction, queue);
			case "music:previous":
				return this.handlePrevious(interaction, queue);
			case "music:loop":
				return this.handleLoop(interaction, queue);
			case "music:stop":
				return this.handleStop(interaction, queue);
			default:
				return interaction.reply({ content: "Unknown action.", flags: MessageFlags.Ephemeral });
		}
	}

	private async handlePlayPause(interaction: ButtonInteraction, queue: GuildQueue) {
		if (queue.node.isPaused()) {
			queue.node.resume();
		} else {
			queue.node.pause();
		}
		const track = queue.currentTrack;
		if (track) {
			return interaction.update({ embeds: [buildNowPlayingEmbed(queue, track)], components: [buildNowPlayingButtons(queue)] });
		}
		return interaction.deferUpdate();
	}

	private async handleSkip(interaction: ButtonInteraction, queue: GuildQueue) {
		queue.node.skip();
		return interaction.deferUpdate();
	}

	private async handlePrevious(interaction: ButtonInteraction, queue: GuildQueue) {
		const historyTracks = queue.history.tracks.toArray();
		if (historyTracks.length === 0) {
			return interaction.reply({ content: "No previous track.", flags: MessageFlags.Ephemeral });
		}
		await queue.history.previous();
		return interaction.deferUpdate();
	}

	private async handleLoop(interaction: ButtonInteraction, queue: GuildQueue) {
		// Cycle: OFF → TRACK → QUEUE → OFF
		const next =
			queue.repeatMode === QueueRepeatMode.OFF
				? QueueRepeatMode.TRACK
				: queue.repeatMode === QueueRepeatMode.TRACK
					? QueueRepeatMode.QUEUE
					: QueueRepeatMode.OFF;
		queue.setRepeatMode(next);
		const track = queue.currentTrack;
		if (track) {
			return interaction.update({ embeds: [buildNowPlayingEmbed(queue, track)], components: [buildNowPlayingButtons(queue)] });
		}
		return interaction.deferUpdate();
	}

	private async handleStop(interaction: ButtonInteraction, queue: GuildQueue) {
		queue.delete();
		return interaction.update({ components: [buildDisabledNowPlayingButtons()] });
	}

	private async handleQueuePage(interaction: ButtonInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue?.currentTrack) {
			return interaction.reply({ content: "Nothing is playing.", flags: MessageFlags.Ephemeral });
		}

		// customId format: music:queue:prev:<page> or music:queue:next:<page>
		const parts = interaction.customId.split(":");
		const direction = parts[2]; // "prev" or "next"
		const currentPage = parseInt(parts[3], 10);

		const tracks = queue.tracks.toArray();
		const totalPages = Math.max(1, Math.ceil(tracks.length / QUEUE_PAGE_SIZE));
		const newPage = direction === "next" ? currentPage + 1 : currentPage - 1;
		const clampedPage = Math.min(Math.max(1, newPage), totalPages);

		return interaction.update({
			embeds: [buildQueueEmbed(queue, clampedPage)],
			components: [buildQueuePageButtons(clampedPage, totalPages)],
		});
	}
}
