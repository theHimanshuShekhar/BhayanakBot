import { container } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Guild, type GuildTextBasedChannel } from "discord.js";
import {
	endGiveaway,
	type Giveaway,
	markGiveawayAnnounced,
	recordGiveawayAnnounceFailure,
} from "../db/queries/giveaways.js";
import { notifyOnly } from "./allowedMentions.js";

/** An ended giveaway whose result could not be posted is retried no sooner than this after the last attempt... */
export const GIVEAWAY_ANNOUNCE_RETRY_DELAY_MS = 60_000;
/** ...and abandoned (and logged) after this many failed attempts. */
export const GIVEAWAY_ANNOUNCE_MAX_ATTEMPTS = 60;

// Discord caps a guild member request at 100 user IDs.
const MEMBER_FETCH_BATCH = 100;

function shuffled<T>(arr: readonly T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/**
 * Picks up to `count` winners from the entrants who are still members of the guild and are not in `exclude`.
 * Entrants are shuffled first and membership is checked in batches, stopping once enough winners are found,
 * so a huge entrant list costs only as many member requests as the draw needs.
 */
export async function drawEligibleWinners(
	guild: Guild,
	entries: readonly string[],
	count: number,
	exclude: readonly string[] = [],
): Promise<string[]> {
	const excluded = new Set(exclude);
	const pool = shuffled(entries.filter((id) => !excluded.has(id)));
	const winners: string[] = [];

	for (let i = 0; i < pool.length && winners.length < count; i += MEMBER_FETCH_BATCH) {
		const batch = pool.slice(i, i + MEMBER_FETCH_BATCH);
		const members = await guild.members.fetch({ user: batch });
		for (const id of batch) {
			if (winners.length >= count) break;
			if (members.has(id)) winners.push(id);
		}
	}
	return winners;
}

export function formatWinners(winners: readonly string[]): string {
	return winners.length > 0 ? winners.map((w) => `<@${w}>`).join(", ") : "None";
}

/**
 * Draws winners, then atomically ends the giveaway and announces. Returns undefined, announcing nothing, when the
 * giveaway was already ended (by the other of task and moderator) or does not belong to the guild. The winners that
 * are stored are the winners that are announced. If the announcement cannot be posted the giveaway stays ended and
 * the `endGiveaways` task retries the announcement; it never draws again.
 */
export async function endAndAnnounceGiveaway(guild: Guild, giveaway: Giveaway): Promise<string[] | undefined> {
	const winners = await drawEligibleWinners(guild, giveaway.entries, giveaway.winnerCount);
	const ended = await endGiveaway(guild.id, giveaway.messageId, winners);
	if (!ended) return undefined;

	await announceGiveawayEnd(guild, ended);
	return winners;
}

/**
 * Posts the result of an ended giveaway and only then marks it announced. A failure is recorded and returns false,
 * leaving the giveaway to be retried.
 */
export async function announceGiveawayEnd(guild: Guild, giveaway: Giveaway): Promise<boolean> {
	let channel: GuildTextBasedChannel;
	try {
		const fetched = await guild.channels.fetch(giveaway.channelId);
		if (!fetched?.isTextBased()) throw new Error(`channel ${giveaway.channelId} cannot be posted to`);
		channel = fetched;
		await postResult(channel, giveaway);
	} catch (error) {
		container.logger.warn(`[Giveaways] Could not announce giveaway ${giveaway.id}; will retry:`, error);
		await recordGiveawayAnnounceFailure(giveaway.id);
		return false;
	}

	await markGiveawayAnnounced(giveaway.id);
	await disableEntryButton(channel, giveaway);
	return true;
}

async function postResult(channel: GuildTextBasedChannel, giveaway: Giveaway): Promise<void> {
	const winners = giveaway.winners;
	const result = winners.length > 0 ? `Congratulations to ${formatWinners(winners)}!` : "No eligible entrants.";
	await channel.send({
		content: `🎉 **Giveaway Ended!** ${result}\nPrize: **${giveaway.prize}**`,
		allowedMentions: notifyOnly(winners),
	});
}

// Best effort: the result is already posted, so a message that cannot be edited does not undo the announcement.
async function disableEntryButton(channel: GuildTextBasedChannel, giveaway: Giveaway): Promise<void> {
	const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
	if (msg) {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("giveaway:enter")
				.setLabel("Giveaway Ended")
				.setStyle(ButtonStyle.Secondary)
				.setEmoji("🎉")
				.setDisabled(true),
		);
		await msg.edit({ components: [row] }).catch(() => null);
	}
}
