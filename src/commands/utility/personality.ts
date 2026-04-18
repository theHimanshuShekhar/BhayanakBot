import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getPersonalityProfile, getUnabsorbedMessages } from "../../db/queries/personality.js";
import { buildPersonalityProfile } from "../../lib/personality/buildProfile.js";

const EXCERPT_LIMIT = 300;

export class PersonalityCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly", "IsAdmin"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("personality")
				.setDescription("View the bot's personality profile for a user (admin only)")
				.addUserOption((opt) => opt.setName("user").setDescription("User to look up (defaults to yourself)").setRequired(false)),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const target = interaction.options.getUser("user") ?? interaction.user;
		const guildId = interaction.guildId!;

		const profile = await getPersonalityProfile(target.id, guildId);

		if (!profile) {
			const messages = await getUnabsorbedMessages(target.id, guildId);

			if (messages.length > 0) {
				// Messages collected but profile not built yet — trigger build now
				void buildPersonalityProfile(target.id, guildId).catch((err) =>
					this.container.logger.error(
						`[personality] Manual build failed for userId=${target.id} guildId=${guildId}:`,
						err,
					),
				);

				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle(`Personality Profile — ${target.displayName}`)
							.setDescription(
								`No profile exists yet, but **${messages.length}** message(s) have been collected.\n\n` +
									`Profile building has been triggered — check back in a minute or two.`,
							),
					],
				});
			}

			// No messages at all — nothing to build from
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle(`Personality Profile — ${target.displayName}`)
						.setDescription(
							"No personality profile exists yet, and no messages have been collected.\n\n" +
								"The profile will build automatically once enough plain-text messages have been sent.",
						),
				],
			});
		}

		const excerpt = profile.length > EXCERPT_LIMIT ? profile.slice(0, EXCERPT_LIMIT) + "..." : profile;

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(`Personality Profile — ${target.displayName}`)
			.setThumbnail(target.displayAvatarURL({ size: 128 }))
			.setDescription(excerpt)
			.setFooter({ text: "Full profile attached as .txt file" });

		const attachment = {
			attachment: Buffer.from(profile, "utf-8"),
			name: `${target.username}-personality.txt`,
		};

		return interaction.editReply({ embeds: [embed], files: [attachment] });
	}
}
