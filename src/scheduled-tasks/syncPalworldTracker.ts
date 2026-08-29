import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { type CategoryChannel, ChannelType, type Guild, type GuildBasedChannel, PermissionFlagsBits } from "discord.js";
import { fetchPalworldPlayers, isPalworldConfigured, type PalworldPlayer } from "../lib/palworld.js";

const CATEGORY_PREFIX = "Palworld";
const MAX_CHANNEL_NAME_LENGTH = 100;
const FAILURES_BEFORE_UNREACHABLE = 2;

// A single failed sweep is not enough to tear down the roster — Palworld servers stall
// while saving the world. See docs/adr/0003-delete-category-when-palworld-unreachable.md

/**
 * `Steam name - Lv 80`. `accountName` is the Steam account; the in-game character name
 * (`name`) is only a fallback for the window before the account name has synced.
 */
export function playerChannelName(player: PalworldPlayer): string {
	// A channel with no name cannot exist, so fall back to something derived from the identity key
	const label = player.accountName.trim() || player.name.trim() || `pal-${player.userId.slice(-6)}`;
	const suffix = ` - Lv ${player.level}`;
	return `${label.slice(0, MAX_CHANNEL_NAME_LENGTH - suffix.length)}${suffix}`;
}

function categoryName(onlineCount: number): string {
	return `${CATEGORY_PREFIX} — ${onlineCount} online`;
}

/**
 * Reduces a channel name to a form both we and Discord agree on. Discord lowercases names,
 * turns spaces into dashes and silently drops characters it dislikes, so the name we sent
 * is never the name we read back. Keeping only letters and digits means every separator
 * Discord might rewrite or drop is gone from both sides, so a rename that can never
 * converge is never re-sent on every sweep. Lossy on purpose: two names differing only in
 * punctuation compare equal and simply keep the name they already have.
 */
export function channelNameSlug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCategory(guild: Guild): CategoryChannel | undefined {
	return guild.channels.cache.find(
		(channel): channel is CategoryChannel =>
			channel.type === ChannelType.GuildCategory && channel.name.startsWith(CATEGORY_PREFIX),
	);
}

export class SyncPalworldTrackerTask extends ScheduledTask {
	private consecutiveFailures = 0;
	private trackerUnavailable = false;
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "syncPalworldTracker" });
	}

	public async run(): Promise<void> {
		if (!isPalworldConfigured()) return;

		const guildId = process.env.TARGET_GUILD_ID?.trim();
		if (!guildId) {
			this.container.logger.warn("[palworld-tracker] TARGET_GUILD_ID is not set — skipping");
			return;
		}

		const players = await fetchPalworldPlayers();
		const unavailable = players === null || players.length === 0;
		if (unavailable) {
			this.consecutiveFailures++;
			if (this.consecutiveFailures < FAILURES_BEFORE_UNREACHABLE || this.trackerUnavailable) return;
		} else {
			this.consecutiveFailures = 0;
		}

		const guild = await this.container.client.guilds.fetch(guildId).catch(() => null);
		if (!guild) {
			this.container.logger.warn(`[palworld-tracker] Guild ${guildId} is unavailable — skipping`);
			return;
		}

		// index.ts runs this task once at startup, before the ready event has filled the
		// caches. Without these fetches the sweep sees a guild with no channels — it would
		// miss the existing category and create a duplicate — and no roles, which makes
		// Discord reject the @everyone permission overwrite as an uncached role.
		try {
			await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
		} catch (err) {
			this.container.logger.warn("[palworld-tracker] Failed to load guild channels/roles — skipping:", err);
			return;
		}

		if (unavailable) {
			this.trackerUnavailable = true;
			this.container.logger.info("[palworld-tracker] Server unavailable — hiding tracker category");
			await this.removeCategory(guild);
			return;
		}

		if (this.trackerUnavailable) {
			this.trackerUnavailable = false;
			this.container.logger.info("[palworld-tracker] Server available — restoring tracker category");
		}

		const startedAt = Date.now();
		this.container.logger.debug("[palworld-tracker] sweep start");
		await this.syncCategory(guild, players);
		this.container.logger.debug(
			`[palworld-tracker] sweep complete online=${players.length} durationMs=${Date.now() - startedAt}`,
		);
	}

	/** The server is unavailable: the category's absence is how that state is expressed. */
	private async removeCategory(guild: Guild): Promise<void> {
		const category = findCategory(guild);
		if (!category) return;

		for (const child of category.children.cache.values()) {
			await this.deleteChannel(child, "Palworld server unavailable");
		}
		try {
			await category.delete("Palworld server unavailable");
		} catch (err) {
			this.container.logger.error("[palworld-tracker] Failed to delete category:", err);
		}
	}

	private async syncCategory(guild: Guild, players: PalworldPlayer[]): Promise<void> {
		let category = findCategory(guild);
		if (!category) {
			category = await guild.channels.create({
				name: categoryName(players.length),
				type: ChannelType.GuildCategory,
				// Player channels are deleted when their player logs off, so anything written in
				// them would be lost. Read-only makes that plain instead of relying on members to infer it.
				permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }],
				reason: "Palworld tracker",
			});
			this.container.logger.info("[palworld-tracker] Created tracker category");
		}

		// The topic holds the player's Palworld userId — the only reliable identity key,
		// since display names collide and Discord mangles channel names.
		const byUserId = new Map<string, GuildBasedChannel>();
		const strays: GuildBasedChannel[] = [];
		for (const child of category.children.cache.values()) {
			const userId = child.type === ChannelType.GuildText ? child.topic?.trim() : undefined;
			if (userId && !byUserId.has(userId)) byUserId.set(userId, child);
			else strays.push(child);
		}

		const online = new Set(players.map((player) => player.userId));
		let created = 0;
		let deleted = 0;
		let renamed = 0;

		for (const [userId, channel] of byUserId) {
			if (online.has(userId)) continue;
			if (await this.deleteChannel(channel, "Player left the Palworld server")) deleted++;
		}
		// The bot owns this category outright, so anything it did not create does not belong here
		for (const channel of strays) {
			if (await this.deleteChannel(channel, "Not a Palworld player channel")) deleted++;
		}

		for (const player of players) {
			const name = playerChannelName(player);
			const channel = byUserId.get(player.userId);
			try {
				if (!channel) {
					await guild.channels.create({
						name,
						type: ChannelType.GuildText,
						parent: category.id,
						topic: player.userId,
						reason: "Player joined the Palworld server",
					});
					created++;
				} else if (channel.type === ChannelType.GuildText && channelNameSlug(channel.name) !== channelNameSlug(name)) {
					// Covers a level change and a display name that has changed under us
					await channel.setName(name, "Palworld player name or level changed");
					renamed++;
				}
			} catch (err) {
				this.container.logger.error(`[palworld-tracker] Failed to sync channel for ${player.userId}:`, err);
			}
		}

		const desiredCategoryName = categoryName(players.length);
		if (category.name !== desiredCategoryName) {
			try {
				await category.setName(desiredCategoryName, "Palworld online count changed");
			} catch (err) {
				this.container.logger.error("[palworld-tracker] Failed to rename category:", err);
			}
		}

		this.container.logger.debug(`[palworld-tracker] channels created=${created} deleted=${deleted} renamed=${renamed}`);
	}

	private async deleteChannel(channel: GuildBasedChannel, reason: string): Promise<boolean> {
		try {
			await channel.delete(reason);
			return true;
		} catch (err) {
			this.container.logger.error(`[palworld-tracker] Failed to delete channel ${channel.id}:`, err);
			return false;
		}
	}
}
