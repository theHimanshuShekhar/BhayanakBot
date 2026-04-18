import { Command } from "@sapphire/framework";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { getOrCreateProfile, getActivePet, getCooldown, setCooldown, setPortraitUrl } from "../../db/queries/rpg.js";
import { generateImage, buildCharacterPrompt } from "../../lib/imageGen.js";
import { formatDuration } from "../../lib/rpg/helpers/cooldown.js";

const PORTRAIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class PortraitCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("portrait").setDescription("Generate your character portrait (CPU image generation, takes a few minutes)"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const cooldownExpiry = await getCooldown(interaction.user.id, "portrait");
		if (cooldownExpiry && cooldownExpiry > new Date()) {
			const remaining = cooldownExpiry.getTime() - Date.now();
			const { profile } = await getOrCreateProfile(interaction.user.id);

			const embed = new EmbedBuilder()
				.setColor(0xfee75c)
				.setTitle("🎨 Character Portrait")
				.setDescription(`⏳ Your portrait cooldown expires in **${formatDuration(remaining)}**.\nYou can generate a new one then.`);

			if (profile.portraitUrl) {
				embed.setImage(profile.portraitUrl);
			}

			return interaction.editReply({ embeds: [embed] });
		}

		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x5865f2)
					.setTitle("🎨 Generating Your Portrait…")
					.setDescription("This may take a few minutes on CPU. Hang tight! ⏳"),
			],
		});

		const { profile, stats } = await getOrCreateProfile(interaction.user.id);
		const activePet = await getActivePet(interaction.user.id);
		const prompt = buildCharacterPrompt(stats, activePet?.petId);

		const imageBuffer = await generateImage(prompt);

		if (!imageBuffer) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle("🎨 Portrait Unavailable")
						.setDescription("The portrait service is currently unavailable. Try again later."),
				],
			});
		}

		const attachment = new AttachmentBuilder(imageBuffer, { name: "portrait.png" });

		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle(`🎨 ${interaction.user.displayName}'s Portrait`)
			.setDescription(`Level **${profile.level}** character portrait`)
			.setImage("attachment://portrait.png")
			.setFooter({ text: "Next portrait available in 7 days" });

		let reply: Awaited<ReturnType<typeof interaction.editReply>>;
		try {
			reply = await interaction.editReply({ embeds: [embed], files: [attachment] });
		} catch {
			// HTTP/2 connection to Discord may have gone stale during long image generation.
			// Fall back to followUp which opens a fresh connection.
			try {
				reply = await interaction.followUp({ embeds: [embed], files: [attachment] });
			} catch {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setTitle("🎨 Upload Failed")
							.setDescription("Portrait was generated but failed to upload to Discord. Please try the command again."),
					],
				});
			}
		}

		// Save the CDN URL from the reply attachment
		const attachmentUrl = reply.attachments.first()?.url;
		if (attachmentUrl) {
			await setPortraitUrl(interaction.user.id, attachmentUrl);
			await setCooldown(interaction.user.id, "portrait", PORTRAIT_COOLDOWN_MS);
		}
	}
}
