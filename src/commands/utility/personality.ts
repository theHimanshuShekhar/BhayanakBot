import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { getPersonalityProfile } from "../../db/queries/personality.js";
import {
	getEligibleGuildTrainingMessageWindow,
	getEligibleUserTrainingMessages,
} from "../../db/queries/personalityTraining.js";
import { guildPersonalityProfiles, userPersonalityProfiles } from "../../db/schema.js";
import { db } from "../../lib/database.js";
import {
	buildGuildPersonalityProfile,
	type GuildPersonalityBuildResult,
	INITIAL_GUILD_PROFILE_THRESHOLD,
	REFRESH_GUILD_PROFILE_THRESHOLD,
} from "../../lib/personality/buildGuildProfile.js";
import {
	buildPersonalityProfile,
	INITIAL_USER_PROFILE_THRESHOLD,
	type PersonalityBuildResult,
	REFRESH_USER_PROFILE_THRESHOLD,
} from "../../lib/personality/buildProfile.js";

const EXCERPT_LIMIT = 300;

function formatTimeAgo(date: Date | null): string {
	if (!date) return "never";
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function formatRefreshResult(result: PersonalityBuildResult | GuildPersonalityBuildResult, evidenceCount: number): string {
	if (result.status === "built") {
		return `Incremental refresh completed from **${evidenceCount}** eligible archived message(s).`;
	}

	const reasons: Record<Exclude<typeof result.status, "built">, string> = {
		skipped_cooldown: "the profile is still in the refresh cooldown",
		skipped_in_progress: "another refresh is already running",
		skipped_insufficient_evidence: "there is not enough archived training evidence",
		skipped_model_empty: "the model returned no profile text",
	};
	return `Refresh skipped: ${reasons[result.status]}.`;
}

function formatArchivedEvidenceCount(count: number, limit: number): string {
	return `${count}${count === limit ? "+" : ""} eligible archived message(s)`;
}

export class PersonalityCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "View or refresh user personality and server culture profiles.",
				examples: [
					"/personality view user",
					"/personality view user user:@someone",
					"/personality view guild",
					"/personality refresh user user:@someone",
					"/personality refresh guild",
				],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("personality")
				.setDescription("View or refresh user personality and server culture profiles")
				.addSubcommandGroup((group) =>
					group
						.setName("view")
						.setDescription("View a personality profile")
						.addSubcommand((sub) =>
							sub
								.setName("user")
								.setDescription("View the personality profile for a user")
								.addUserOption((opt) =>
									opt.setName("user").setDescription("User to look up (defaults to yourself)").setRequired(false),
								),
						)
						.addSubcommand((sub) => sub.setName("guild").setDescription("View this server's culture profile")),
				)
				.addSubcommandGroup((group) =>
					group
						.setName("refresh")
						.setDescription("Start an incremental profile refresh from archived messages")
						.addSubcommand((sub) =>
							sub
								.setName("user")
								.setDescription("Refresh a user's personality profile from new archive evidence")
								.addUserOption((opt) =>
									opt.setName("user").setDescription("User to refresh (defaults to yourself)").setRequired(false),
								),
						)
						.addSubcommand((sub) =>
							sub.setName("guild").setDescription("Refresh this server's culture profile from new archive evidence"),
						),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const subcommand = interaction.options.getSubcommand(true);
		const group = interaction.options.getSubcommandGroup(true);
		const target = interaction.options.getUser("user") ?? interaction.user;
		const guildId = interaction.guildId!;

		const settings = await getOrCreateSettings(guildId);
		if (!settings.personalityEnabled) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle("Personality Profiles Disabled")
						.setDescription("Personality profiling is disabled for this server. A server administrator can enable it with `/config`."),
				],
			});
		}

		if (group === "refresh") {
			// Admin check
			const member = await interaction.guild!.members.fetch(interaction.user.id);
			const isAdmin = member.permissions.has("Administrator");
			if (!isAdmin) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setTitle("Permission Denied")
							.setDescription("Only server administrators can force a profile refresh."),
					],
				});
			}

			if (subcommand === "guild") {
				return this.refreshGuildProfile(interaction, guildId);
			}

			return this.refreshUserProfile(interaction, target, guildId);
		}

		if (subcommand === "guild") {
			return this.viewGuildProfile(interaction, guildId);
		}

		return this.viewUserProfile(interaction, target, guildId);
	}

	private async refreshUserProfile(interaction: Command.ChatInputCommandInteraction, target: NonNullable<ReturnType<Command.ChatInputCommandInteraction["options"]["getUser"]>>, guildId: string) {
		const row = await db.query.userPersonalityProfiles.findFirst({
			where: and(eq(userPersonalityProfiles.userId, target.id), eq(userPersonalityProfiles.guildId, guildId)),
			columns: { profile: true, lastTrainingMessageAt: true, lastTrainingMessageId: true },
		});
		const threshold = row?.profile ? REFRESH_USER_PROFILE_THRESHOLD : INITIAL_USER_PROFILE_THRESHOLD;
		const messages = await getEligibleUserTrainingMessages({
			guildId,
			userId: target.id,
			afterMessageCreatedAt: row?.lastTrainingMessageAt ?? null,
			afterMessageId: row?.lastTrainingMessageId ?? null,
			limit: threshold,
		});

		if (messages.length < threshold) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle(`Refresh — ${target.displayName}`)
						.setDescription(`Not enough archived training evidence yet; need at least ${threshold} eligible archived message(s).`),
				],
			});
		}

		const result = await buildPersonalityProfile(target.id, guildId);

		return interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(result.status === "built" ? 0x57f287 : 0xfee75c)
					.setTitle(`Refresh — ${target.displayName}`)
					.setDescription(
						`${formatRefreshResult(result, messages.length)}\n\n` +
							`Use \`/personality view user user:${target.toString()}\` to view the current profile.`,
					),
			],
		});
	}

	private async refreshGuildProfile(interaction: Command.ChatInputCommandInteraction, guildId: string) {
		const row = await db.query.guildPersonalityProfiles.findFirst({
			where: eq(guildPersonalityProfiles.guildId, guildId),
			columns: { profile: true, lastTrainingMessageAt: true, lastTrainingMessageId: true },
		});
		const threshold = row?.profile ? REFRESH_GUILD_PROFILE_THRESHOLD : INITIAL_GUILD_PROFILE_THRESHOLD;
		const messages = await getEligibleGuildTrainingMessageWindow({
			guildId,
			afterMessageCreatedAt: row?.lastTrainingMessageAt ?? null,
			afterMessageId: row?.lastTrainingMessageId ?? null,
			limit: threshold,
		});

		if (messages.length < threshold) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle("Refresh — Server Culture")
						.setDescription(`Not enough archived training evidence yet; need at least ${threshold} eligible archived message(s).`),
				],
			});
		}

		const result = await buildGuildPersonalityProfile(guildId);

		return interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(result.status === "built" ? 0x57f287 : 0xfee75c)
					.setTitle("Refresh — Server Culture")
					.setDescription(
						`${formatRefreshResult(result, messages.length)}\n\n` +
							"Use `/personality view guild` to view the current profile.",
					),
			],
		});
	}

	private async viewUserProfile(interaction: Command.ChatInputCommandInteraction, target: NonNullable<ReturnType<Command.ChatInputCommandInteraction["options"]["getUser"]>>, guildId: string) {
		const profile = await getPersonalityProfile(target.id, guildId);

		if (!profile) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle(`User Personality Profile — ${target.displayName}`)
						.setDescription(
							`No user profile exists yet. It builds automatically once at least ${INITIAL_USER_PROFILE_THRESHOLD} eligible archived message(s) are available.`,
						),
				],
			});
		}

		// Fetch metadata for the embed fields
		const row = await db.query.userPersonalityProfiles.findFirst({
			where: and(eq(userPersonalityProfiles.userId, target.id), eq(userPersonalityProfiles.guildId, guildId)),
			columns: { lastRefreshedAt: true, lastTrainingMessageAt: true, lastTrainingMessageId: true },
		});
		const archivedEvidence = await getEligibleUserTrainingMessages({
			guildId,
			userId: target.id,
			afterMessageCreatedAt: row?.lastTrainingMessageAt ?? null,
			afterMessageId: row?.lastTrainingMessageId ?? null,
			limit: REFRESH_USER_PROFILE_THRESHOLD,
		});

		const excerpt = profile.length > EXCERPT_LIMIT ? profile.slice(0, EXCERPT_LIMIT) + "..." : profile;

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(`User Personality Profile — ${target.displayName}`)
			.setThumbnail(target.displayAvatarURL({ size: 128 }))
			.setDescription(excerpt)
			.addFields(
				{
					name: "Last refreshed",
					value: formatTimeAgo(row?.lastRefreshedAt ?? null),
					inline: true,
				},
				{
					name: "Archived evidence after cursor",
					value: formatArchivedEvidenceCount(archivedEvidence.length, REFRESH_USER_PROFILE_THRESHOLD),
					inline: true,
				},
			)
			.setFooter({ text: "Full profile attached as .txt file" });

		const attachment = {
			attachment: Buffer.from(profile, "utf-8"),
			name: `${target.username}-personality.txt`,
		};

		try {
			return await interaction.editReply({ embeds: [embed], files: [attachment] });
		} catch {
			try {
				return await interaction.followUp({ embeds: [embed], files: [attachment], ephemeral: true });
			} catch {
				return interaction.followUp({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setTitle(`User Personality Profile — ${target.displayName}`)
							.setDescription("Failed to upload the profile. Please try again."),
					],
					ephemeral: true,
				});
			}
		}
	}

	private async viewGuildProfile(interaction: Command.ChatInputCommandInteraction, guildId: string) {
		const row = await db.query.guildPersonalityProfiles.findFirst({
			where: eq(guildPersonalityProfiles.guildId, guildId),
			columns: { profile: true, lastRefreshedAt: true, lastTrainingMessageAt: true, lastTrainingMessageId: true },
		});
		const guildName = interaction.guild?.name ?? "This Server";

		if (!row?.profile) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle("Server Culture Profile")
						.setDescription(
							`No server culture profile exists yet. It builds automatically once at least ${INITIAL_GUILD_PROFILE_THRESHOLD} eligible archived message(s) are available.`,
						),
				],
			});
		}

		const excerpt = row.profile.length > EXCERPT_LIMIT ? row.profile.slice(0, EXCERPT_LIMIT) + "..." : row.profile;
		const archivedEvidence = await getEligibleGuildTrainingMessageWindow({
			guildId,
			afterMessageCreatedAt: row.lastTrainingMessageAt ?? null,
			afterMessageId: row.lastTrainingMessageId ?? null,
			limit: REFRESH_GUILD_PROFILE_THRESHOLD,
		});
		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(`Server Culture Profile — ${guildName}`)
			.setDescription(excerpt)
			.addFields(
				{ name: "Last refreshed", value: formatTimeAgo(row.lastRefreshedAt ?? null), inline: true },
				{
					name: "Archived evidence after cursor",
					value: formatArchivedEvidenceCount(archivedEvidence.length, REFRESH_GUILD_PROFILE_THRESHOLD),
					inline: true,
				},
			)
			.setFooter({ text: "Full profile attached as .txt file" });

		const attachment = {
			attachment: Buffer.from(row.profile, "utf-8"),
			name: `${guildName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-culture.txt`,
		};

		try {
			return await interaction.editReply({ embeds: [embed], files: [attachment] });
		} catch {
			try {
				return await interaction.followUp({ embeds: [embed], files: [attachment], ephemeral: true });
			} catch {
				return interaction.followUp({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setTitle("Server Culture Profile")
							.setDescription("Failed to upload the profile. Please try again."),
					],
					ephemeral: true,
				});
			}
		}
	}
}
