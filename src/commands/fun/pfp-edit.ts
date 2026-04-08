import { Command } from "@sapphire/framework";
import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { eq } from "drizzle-orm";
import { db } from "../../lib/database.js";
import { guildSettings } from "../../db/schema.js";
import { getCooldown, setCooldown } from "../../db/queries/rpg.js";
import { formatDuration } from "../../lib/rpg/helpers/cooldown.js";
import { transformAvatar } from "../../lib/imageGen.js";
import { isNsfwPrompt } from "../../lib/nsfwBlocklist.js";

const USER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const TARGET_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

const PRESET_PROMPTS: Record<string, string> = {
	anime: "anime style, cel shaded, manga art",
	zombie: "zombie, undead, rotting flesh, horror portrait",
	oil_painting: "classical oil painting, brush strokes, fine art",
	pixel_art: "pixel art, 8-bit retro sprite",
	sketch: "pencil sketch, hand drawn, graphite",
	deepfry: "deep fried meme, over-saturated, heavy jpeg artifacts",
	wanted: "old western wanted poster, sepia, weathered paper",
	cartoon: "cartoon style, bold outlines, bright flat colors",
	robot: "cyberpunk robot, mechanical parts, chrome",
	lego: "lego minifigure, plastic toy, studio lighting",
	magik: "content-aware scaled, liquify distorted, stretched meme",
	triggered: "triggered meme, red tint, intense angry expression",
	warp: "funhouse mirror warp, distorted face, stretched features",
	pride: "rainbow pride colors, colorful, LGBT pride flag color palette",
	jail: "behind jail bars, prison cell bars in foreground",
	fedora: "wearing a fedora hat, trilby, neckbeard gentleman",
	rip: "RIP gravestone portrait, ghost, memorial, deceased",
	slap: "being slapped, comic impact effect, hand slapping face",
	spank: "cartoon spank, impact stars, funny comic effect",
	trash: "inside a trash can, garbage can, oscar the grouch",
	crabrave: "crab rave, dancing crab, neon party colors, rave",
};

const PRESET_CHOICES = Object.keys(PRESET_PROMPTS).map((key) => ({ name: key.replace("_", " "), value: key }));

export class PfpEditCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("pfp-edit")
				.setDescription("Transform a user's avatar using AI image generation")
				.addUserOption((opt) => opt.setName("user").setDescription("User to edit (defaults to yourself)").setRequired(false))
				.addStringOption((opt) =>
					opt.setName("effect").setDescription("Preset effect to apply").setRequired(false).addChoices(...PRESET_CHOICES),
				)
				.addStringOption((opt) =>
					opt.setName("prompt").setDescription("Custom prompt (trusted users only)").setRequired(false).setMaxLength(200),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const target = interaction.options.getUser("user") ?? interaction.user;
		const isSelf = target.id === interaction.user.id;

		// Per-user cooldown
		const userCooldown = await getCooldown(interaction.user.id, "pfp-edit");
		if (userCooldown && userCooldown > new Date()) {
			const remaining = userCooldown.getTime() - Date.now();
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xfee75c)
						.setDescription(`⏳ You can use this again in **${formatDuration(remaining)}**.`),
				],
			});
		}

		// Per-target cooldown (only when targeting others)
		if (!isSelf) {
			const targetCooldown = await getCooldown(interaction.user.id, `pfp-edit-target:${target.id}`);
			if (targetCooldown && targetCooldown > new Date()) {
				const remaining = targetCooldown.getTime() - Date.now();
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xfee75c)
							.setDescription(
								`⏳ You already edited **${target.displayName}**'s avatar recently. Try again in **${formatDuration(remaining)}**.`,
							),
					],
				});
			}
		}

		// Resolve prompt
		const rawPrompt = interaction.options.getString("prompt");
		const effectKey = interaction.options.getString("effect");
		let resolvedPrompt: string;
		let effectLabel: string;

		if (rawPrompt) {
			// Check trusted role
			const member = interaction.guild!.members.cache.get(interaction.user.id);
			const trusted = await isTrusted(member ?? null, interaction.guild!.id);
			if (!trusted) {
				return interaction.editReply({
					embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("Custom prompts require a trusted role.")],
				});
			}
			if (isNsfwPrompt(rawPrompt)) {
				return interaction.editReply({
					embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("That prompt isn't allowed.")],
				});
			}
			resolvedPrompt = rawPrompt;
			effectLabel = "custom";
		} else if (effectKey && PRESET_PROMPTS[effectKey]) {
			resolvedPrompt = PRESET_PROMPTS[effectKey];
			effectLabel = effectKey.replace("_", " ");
		} else {
			return interaction.editReply({
				embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("Please provide an `effect` or `prompt`.")],
			});
		}

		await interaction.editReply({
			embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("🎨 Editing avatar… This may take up to 5 minutes on CPU.")],
		});

		// Fetch avatar
		let imageBuffer: Buffer;
		try {
			const avatarUrl = target.displayAvatarURL({ extension: "png", size: 256 });
			const avatarRes = await fetch(avatarUrl, { signal: AbortSignal.timeout(10_000) });
			if (!avatarRes.ok) throw new Error(`Avatar fetch failed: ${avatarRes.status}`);
			imageBuffer = Buffer.from(await avatarRes.arrayBuffer());
		} catch {
			return interaction.editReply({
				embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("Could not fetch avatar. Please try again later.")],
			});
		}

		const resultBuffer = await transformAvatar(imageBuffer, resolvedPrompt);
		if (!resultBuffer) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle("🎨 Image Unavailable")
						.setDescription("The image service is currently unavailable. Try again later."),
				],
			});
		}

		const attachment = new AttachmentBuilder(resultBuffer, { name: "pfp-edit.png" });
		const embed = new EmbedBuilder()
			.setColor(0x57f287)
			.setTitle(`🎨 ${target.displayName}'s avatar — ${effectLabel}`)
			.setImage("attachment://pfp-edit.png")
			.setFooter({ text: `Requested by ${interaction.user.displayName}` });

		await interaction.editReply({ embeds: [embed], files: [attachment] });

		await setCooldown(interaction.user.id, "pfp-edit", USER_COOLDOWN_MS);
		if (!isSelf) {
			await setCooldown(interaction.user.id, `pfp-edit-target:${target.id}`, TARGET_COOLDOWN_MS);
		}
	}
}

async function isTrusted(member: import("discord.js").GuildMember | null, guildId: string): Promise<boolean> {
	if (!member) return false;
	if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
	if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
	const settings = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
	if (settings?.moderatorRoleId && member.roles.cache.has(settings.moderatorRoleId)) return true;
	return false;
}
