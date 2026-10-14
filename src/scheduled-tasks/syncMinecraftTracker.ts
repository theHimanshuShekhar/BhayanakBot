import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { type CategoryChannel, ChannelType, type Guild, type GuildBasedChannel, PermissionFlagsBits } from "discord.js";
import { fetchMinecraftPlayers, isMinecraftRconConfigured, type MinecraftPlayer } from "../lib/minecraftRcon.js";

const CATEGORY_PREFIX = "Minecraft";
const CATEGORY_NAME_PATTERN = /^Minecraft — \d+ online$/;
const MAX_CHANNEL_NAME_LENGTH = 100;
const FAILURES_BEFORE_UNREACHABLE = 2;
// Uncategorized channels always render above categories, so position 0 is the
// first category slot directly below general/rules/extra-pins.
const TRACKER_CATEGORY_POSITION = 0;

export function playerChannelName(player: MinecraftPlayer): string {
	return player.name.trim().slice(0, MAX_CHANNEL_NAME_LENGTH) || "minecraft-player";
}

export function channelNameSlug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function categoryName(onlineCount: number): string {
	return `${CATEGORY_PREFIX} — ${onlineCount} online`;
}

function findCategory(guild: Guild): CategoryChannel | undefined {
	return guild.channels.cache.find(
		(channel): channel is CategoryChannel =>
			channel.type === ChannelType.GuildCategory && CATEGORY_NAME_PATTERN.test(channel.name),
	);
}

export class SyncMinecraftTrackerTask extends ScheduledTask {
	private consecutiveFailures = 0;
	private trackerUnavailable = false;

	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "syncMinecraftTracker" });
	}

	public async run(): Promise<void> {
		if (!isMinecraftRconConfigured()) return;

		const guildId = process.env.TARGET_GUILD_ID?.trim();
		if (!guildId) {
			this.container.logger.warn("[minecraft-tracker] TARGET_GUILD_ID is not set — skipping");
			return;
		}

		const players = await fetchMinecraftPlayers();
		const unavailable = players === null || players.length === 0;
		if (unavailable) {
			this.consecutiveFailures++;
			if (this.consecutiveFailures < FAILURES_BEFORE_UNREACHABLE || this.trackerUnavailable) return;
		} else {
			this.consecutiveFailures = 0;
		}

		const guild = await this.container.client.guilds.fetch(guildId).catch(() => null);
		if (!guild) {
			this.container.logger.warn(`[minecraft-tracker] Guild ${guildId} is unavailable — skipping`);
			return;
		}

		try {
			await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
		} catch (err) {
			this.container.logger.warn("[minecraft-tracker] Failed to load guild channels/roles — skipping:", err);
			return;
		}

		if (unavailable) {
			this.trackerUnavailable = true;
			this.container.logger.info("[minecraft-tracker] Server unavailable — hiding tracker category");
			await this.removeCategory(guild);
			return;
		}

		if (this.trackerUnavailable) {
			this.trackerUnavailable = false;
			this.container.logger.info("[minecraft-tracker] Server available — restoring tracker category");
		}

		const startedAt = Date.now();
		this.container.logger.debug("[minecraft-tracker] sweep start");
		await this.syncCategory(guild, players);
		this.container.logger.debug(
			`[minecraft-tracker] sweep complete online=${players.length} durationMs=${Date.now() - startedAt}`,
		);
	}

	private async removeCategory(guild: Guild): Promise<void> {
		const category = findCategory(guild);
		if (!category) return;

		for (const child of category.children.cache.values()) {
			await this.deleteChannel(child, "Minecraft server unavailable");
		}
		try {
			await category.delete("Minecraft server unavailable");
		} catch (err) {
			this.container.logger.error("[minecraft-tracker] Failed to delete category:", err);
		}
	}

	private async syncCategory(guild: Guild, players: MinecraftPlayer[]): Promise<void> {
		let category = findCategory(guild);
		if (!category) {
			category = await guild.channels.create({
				name: categoryName(players.length),
				type: ChannelType.GuildCategory,
				position: TRACKER_CATEGORY_POSITION,
				permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }],
				reason: "Minecraft tracker",
			});
			this.container.logger.info("[minecraft-tracker] Created tracker category");
		} else {
			await this.ensureTopPosition(category);
		}

		const byPlayerName = new Map<string, GuildBasedChannel>();
		const strays: GuildBasedChannel[] = [];
		for (const child of category.children.cache.values()) {
			const playerName = child.type === ChannelType.GuildText ? child.topic?.trim() : undefined;
			if (playerName && !byPlayerName.has(playerName)) byPlayerName.set(playerName, child);
			else strays.push(child);
		}

		const online = new Set(players.map((player) => player.name));
		let created = 0;
		let deleted = 0;
		let renamed = 0;

		for (const [playerName, channel] of byPlayerName) {
			if (online.has(playerName)) continue;
			if (await this.deleteChannel(channel, "Player left the Minecraft server")) deleted++;
		}
		for (const channel of strays) {
			if (await this.deleteChannel(channel, "Not a Minecraft player channel")) deleted++;
		}

		for (const player of players) {
			const name = playerChannelName(player);
			const channel = byPlayerName.get(player.name);
			try {
				if (!channel) {
					await guild.channels.create({
						name,
						type: ChannelType.GuildText,
						parent: category.id,
						topic: player.name,
						reason: "Player joined the Minecraft server",
					});
					created++;
				} else if (channel.type === ChannelType.GuildText && channelNameSlug(channel.name) !== channelNameSlug(name)) {
					await channel.setName(name, "Minecraft player name changed");
					renamed++;
				}
			} catch (err) {
				this.container.logger.error(`[minecraft-tracker] Failed to sync channel for ${player.name}:`, err);
			}
		}

		const desiredCategoryName = categoryName(players.length);
		if (category.name !== desiredCategoryName) {
			try {
				await category.setName(desiredCategoryName, "Minecraft online count changed");
			} catch (err) {
				this.container.logger.error("[minecraft-tracker] Failed to rename category:", err);
			}
		}

		this.container.logger.debug(
			`[minecraft-tracker] channels created=${created} deleted=${deleted} renamed=${renamed}`,
		);
	}
	private async ensureTopPosition(category: CategoryChannel): Promise<void> {
		if (category.position === TRACKER_CATEGORY_POSITION) return;
		try {
			await category.setPosition(TRACKER_CATEGORY_POSITION, { reason: "Keep Minecraft tracker at the top" });
		} catch (err) {
			this.container.logger.error("[minecraft-tracker] Failed to move category to the top:", err);
		}
	}

	private async deleteChannel(channel: GuildBasedChannel, reason: string): Promise<boolean> {
		try {
			await channel.delete(reason);
			return true;
		} catch (err) {
			this.container.logger.error(`[minecraft-tracker] Failed to delete channel ${channel.id}:`, err);
			return false;
		}
	}
}
