import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getPersonalityProfile } from "../../db/queries/personality.js";

const FIELD_LIMIT = 1024;

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
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setTitle(`Personality Profile — ${target.displayName}`)
						.setDescription("No personality profile exists for this user yet. The bot needs more messages to build one."),
				],
			});
		}

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(`Personality Profile — ${target.displayName}`)
			.setThumbnail(target.displayAvatarURL({ size: 128 }));

		// Split profile into chunks that fit Discord's field value limit
		const chunks: string[] = [];
		let remaining = profile;
		while (remaining.length > 0) {
			chunks.push(remaining.slice(0, FIELD_LIMIT));
			remaining = remaining.slice(FIELD_LIMIT);
		}

		for (let i = 0; i < chunks.length; i++) {
			embed.addFields({ name: i === 0 ? "Profile" : "\u200b", value: chunks[i] });
		}

		return interaction.editReply({ embeds: [embed] });
	}
}
