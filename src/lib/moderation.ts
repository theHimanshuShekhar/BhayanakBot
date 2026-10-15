import { container } from "@sapphire/framework";
import type { ChatInputCommandInteraction, EmbedBuilder, GuildMember, TextChannel } from "discord.js";
import { getOrCreateSettings } from "../db/queries/guildSettings.js";
import { createCase } from "../db/queries/modCases.js";

/** Discord's audit-log reason limit; reasons are stored, logged, and shown as given. */
export const REASON_MAX_LENGTH = 512;

/**
 * Pre-flight check for an action against a guild member. Returns the message to show the moderator, or null when
 * the action may proceed. Must run before any DM or side effect so a refusal changes nothing.
 */
export function targetBlocker(
	interaction: ChatInputCommandInteraction,
	target: GuildMember,
	verb: string,
	botCanAct: boolean,
): string | null {
	const myHighest = interaction.guild!.members.me!.roles.highest.position;
	const modHighest = (interaction.member as GuildMember).roles.highest.position;
	const targetHighest = target.roles.highest.position;
	if (targetHighest >= myHighest) return `❌ I cannot ${verb} a member with an equal or higher role than me.`;
	if (targetHighest >= modHighest) return `❌ You cannot ${verb} a member with an equal or higher role than you.`;
	if (!botCanAct) return `❌ I don't have permission to ${verb} this member.`;
	return null;
}

/** Posts the embed to the log channel. Never throws; false means a configured log could not be posted. */
export async function logToChannel(interaction: ChatInputCommandInteraction, embed: EmbedBuilder): Promise<boolean> {
	try {
		const settings = await getOrCreateSettings(interaction.guildId!);
		if (!settings.logChannelId) return true;
		const logChannel = interaction.guild?.channels.cache.get(settings.logChannelId) as TextChannel | undefined;
		if (!logChannel) return false;
		await logChannel.send({ embeds: [embed] });
		return true;
	} catch (error) {
		container.logger.warn("[moderation] Could not post to the log channel:", error);
		return false;
	}
}

/**
 * Final step of every moderation action: record the Moderation Case, post the log entry, answer the moderator.
 * The action has already happened, so a failed record or log is reported plainly instead of failing the reply.
 */
export async function recordAndReport(
	interaction: ChatInputCommandInteraction,
	options: {
		caseData: Parameters<typeof createCase>[0];
		/** Shown instead of the embed when the case could not be written. */
		notRecorded: string;
		buildEmbed: (caseNumber: number) => EmbedBuilder;
	},
) {
	let caseNumber: number;
	try {
		caseNumber = (await createCase(options.caseData)).caseNumber;
	} catch (error) {
		container.logger.error("[moderation] Could not record case:", error);
		return interaction.editReply(options.notRecorded);
	}

	const embed = options.buildEmbed(caseNumber);
	const logged = await logToChannel(interaction, embed);
	return interaction.editReply({
		content: logged ? undefined : "⚠️ The log entry could not be posted to the log channel.",
		embeds: [embed],
	});
}
