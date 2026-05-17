import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { getPersonalityProfile, getUnabsorbedMessages } from "../../db/queries/personality.js";
import { userPersonalityProfiles } from "../../db/schema.js";
import { db } from "../../lib/database.js";
import { buildPersonalityProfile } from "../../lib/personality/buildProfile.js";

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

export class PersonalityCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "View or refresh the bot's personality profile for a user.",
				examples: ["/personality view", "/personality view user:@someone", "/personality refresh user:@someone"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("personality")
				.setDescription("View or refresh the bot's personality profile for a user")
				.addSubcommand((sub) =>
					sub
						.setName("view")
						.setDescription("View the personality profile for a user")
						.addUserOption((opt) =>
							opt.setName("user").setDescription("User to look up (defaults to yourself)").setRequired(false),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("refresh")
						.setDescription("Force a rebuild of the personality profile (admin only)")
						.addUserOption((opt) =>
							opt.setName("user").setDescription("User to rebuild (defaults to yourself)").setRequired(false),
						),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const subcommand = interaction.options.getSubcommand(true);
		const target = interaction.options.getUser("user") ?? interaction.user;
		const guildId = interaction.guildId!;

		if (subcommand === "refresh") {
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

			const messages = await getUnabsorbedMessages(target.id, guildId);
			if (messages.length === 0) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xfee75c)
							.setTitle(`Refresh — ${target.displayName}`)
							.setDescription("No unabsorbed messages to build from. Send some messages first."),
					],
				});
			}

			void buildPersonalityProfile(target.id, guildId).catch((err) =>
				this.container.logger.error(
					`[personality] Manual refresh failed for userId=${target.id} guildId=${guildId}:`,
					err,
				),
			);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle(`Refresh — ${target.displayName}`)
						.setDescription(
							`Profile rebuild triggered using **${messages.length}** message(s).\n\n` +
								`Check back in a minute or two with \`/personality view user:${target.toString()}\`.`,
						),
				],
			});
		}

		// subcommand === "view"
		const profile = await getPersonalityProfile(target.id, guildId);
		const messages = await getUnabsorbedMessages(target.id, guildId);

		if (!profile) {
			if (messages.length > 0) {
				void buildPersonalityProfile(target.id, guildId).catch((err) =>
					this.container.logger.error(
						`[personality] Auto-build failed for userId=${target.id} guildId=${guildId}:`,
						err,
					),
				);

				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle(`Personality Profile — ${target.displayName}`)
							.setDescription(
								`No profile yet, but **${messages.length}** message(s) collected.\n\n` +
									`Building now — check back in a minute or two.`,
							),
					],
				});
			}

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle(`Personality Profile — ${target.displayName}`)
						.setDescription(
							"No profile exists yet, and no messages have been collected.\n\n" +
								"The profile builds automatically once enough meaningful messages have been sent.",
						),
				],
			});
		}

		// Fetch metadata for the embed fields
		const row = await db.query.userPersonalityProfiles.findFirst({
			where: and(eq(userPersonalityProfiles.userId, target.id), eq(userPersonalityProfiles.guildId, guildId)),
			columns: { lastRefreshedAt: true, newMessageCount: true },
		});

		const excerpt = profile.length > EXCERPT_LIMIT ? profile.slice(0, EXCERPT_LIMIT) + "..." : profile;

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(`Personality Profile — ${target.displayName}`)
			.setThumbnail(target.displayAvatarURL({ size: 128 }))
			.setDescription(excerpt)
			.addFields(
				{
					name: "Last refreshed",
					value: formatTimeAgo(row?.lastRefreshedAt ?? null),
					inline: true,
				},
				{
					name: "Unabsorbed messages",
					value: `${messages.length} (next build at 100)`,
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
							.setTitle(`Personality Profile — ${target.displayName}`)
							.setDescription("Failed to upload the profile. Please try again."),
					],
					ephemeral: true,
				});
			}
		}
	}
}
