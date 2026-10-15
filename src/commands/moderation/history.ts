import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { getUserCases, type ModCase } from "../../db/queries/modCases.js";

const typeEmoji: Record<string, string> = {
	warn: "⚠️",
	mute: "🔇",
	unmute: "🔊",
	kick: "👢",
	ban: "🔨",
	unban: "✅",
	tempban: "⏱️",
};

const MAX_CASES_SHOWN = 20;
const MAX_REASON_LENGTH = 100;
const EMBED_DESCRIPTION_LIMIT = 4096;

function truncateReason(reason: string | null): string {
	const flat = (reason ?? "No reason").replace(/\s+/g, " ").trim() || "No reason";
	return flat.length > MAX_REASON_LENGTH ? `${flat.slice(0, MAX_REASON_LENGTH - 1)}…` : flat;
}

/** Newest cases first, one line each, cut off before the embed description limit. */
export function buildHistoryLines(cases: ModCase[]): string[] {
	const lines: string[] = [];
	let length = 0;
	for (const c of cases.slice(0, MAX_CASES_SHOWN)) {
		const line = `${typeEmoji[c.type] ?? "❓"} **Case #${c.caseNumber}** (${c.type}) — ${truncateReason(c.reason)} — <t:${Math.floor(c.createdAt.getTime() / 1000)}:d>`;
		if (length + line.length + 1 > EMBED_DESCRIPTION_LIMIT) break;
		lines.push(line);
		length += line.length + 1;
	}
	return lines;
}

export class HistoryCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "history",
			description: "View moderation history for a user",
			preconditions: [
				"GuildOnly",
				{ name: "IsModerator", context: { permission: PermissionFlagsBits.ManageMessages } },
			],
			help: {
				summary: "View moderation history for a user.",
				examples: ["/history user:@someone"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("history")
				.setDescription("View moderation history for a user")
				.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
				.addUserOption((opt) => opt.setName("user").setDescription("User to view history for").setRequired(true)),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const target = interaction.options.getUser("user", true);
		const cases = await getUserCases(interaction.guildId!, target.id);

		if (cases.length === 0) {
			return interaction.editReply(`✅ **${target.tag}** has no moderation history.`);
		}

		const lines = buildHistoryLines(cases);
		const embed = new EmbedBuilder()
			.setTitle(`📋 Moderation History — ${target.tag}`)
			.setThumbnail(target.displayAvatarURL())
			.setColor(0x5865f2)
			.setDescription(lines.join("\n"))
			.setFooter({
				text:
					lines.length < cases.length
						? `Showing ${lines.length} of ${cases.length} cases`
						: `Total: ${cases.length} cases`,
			})
			.setTimestamp();

		return interaction.editReply({ embeds: [embed] });
	}
}
