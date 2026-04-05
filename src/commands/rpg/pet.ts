import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getOrCreateProfile, getOwnedPets, addPet, renamePet, tryDebitCoins } from "../../db/queries/rpg.js";
import { getBuyablePets, getPet } from "../../lib/rpg/catalogs/pets.js";

const RARITY_COLOR: Record<string, number> = {
	common: 0x99aab5,
	uncommon: 0x57f287,
	rare: 0x5865f2,
	legendary: 0xfee75c,
};

const PET_CHOICES = getBuyablePets().map((p) => ({
	name: `${p.emoji} ${p.name} (${p.price.toLocaleString()} coins)`,
	value: p.id,
}));

export class PetCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("pet")
				.setDescription("View, adopt, or rename your pets")
				.addSubcommand((sub) => sub.setName("view").setDescription("View your pets"))
				.addSubcommand((sub) =>
					sub
						.setName("adopt")
						.setDescription("Adopt a pet from the market")
						.addStringOption((opt) =>
							opt
								.setName("pet")
								.setDescription("Pet to adopt")
								.setRequired(true)
								.addChoices(...PET_CHOICES),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("rename")
						.setDescription("Give a pet a nickname")
						.addStringOption((opt) =>
							opt.setName("pet").setDescription("Pet ID to rename (e.g. cat, dog, parrot)").setRequired(true),
						)
						.addStringOption((opt) =>
							opt.setName("name").setDescription("New nickname (max 32 chars)").setRequired(true),
						),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand(true);

		if (sub === "view") {
			await interaction.deferReply({ ephemeral: true });
			const pets = await getOwnedPets(interaction.user.id);

			if (pets.length === 0) {
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0x5865f2)
							.setDescription("You don't own any pets yet. Use `/pet adopt` to get one."),
					],
				});
			}

			const lines = pets.map((op) => {
				const pet = getPet(op.petId);
				const display = op.nickname
					? `**${op.nickname}** *(${pet?.name ?? op.petId})*`
					: `**${pet?.name ?? op.petId}**`;
				return `${pet?.emoji ?? "🐾"} ${display}\n*${pet?.description ?? ""}* \`[${pet?.rarity ?? "?"}]\``;
			});

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle("🐾 Your Pets")
						.setColor(0x5865f2)
						.setDescription(lines.join("\n\n")),
				],
			});
		}

		if (sub === "adopt") {
			await interaction.deferReply({ ephemeral: true });
			const petId = interaction.options.getString("pet", true);
			const pet = getPet(petId);

			if (!pet || pet.price === 0) {
				return interaction.editReply({ content: "That pet isn't available for adoption." });
			}

			const remaining = await tryDebitCoins(interaction.user.id, pet.price);
			if (remaining === null) {
				const { profile } = await getOrCreateProfile(interaction.user.id);
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setDescription(
								`❌ You need **${pet.price.toLocaleString()} coins** to adopt ${pet.emoji} **${pet.name}**, but you only have **${profile.coins.toLocaleString()}**.`,
							),
					],
				});
			}

			await addPet(interaction.user.id, petId);

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(RARITY_COLOR[pet.rarity] ?? 0x5865f2)
						.setTitle(`${pet.emoji} Adopted ${pet.name}!`)
						.setDescription(`*${pet.description}*\n\nPaid **${pet.price.toLocaleString()} coins**.`)
						.setFooter({ text: `Rarity: ${pet.rarity}` }),
				],
			});
		}

		if (sub === "rename") {
			await interaction.deferReply({ ephemeral: true });
			const petId = interaction.options.getString("pet", true);
			const newName = interaction.options.getString("name", true).slice(0, 32);
			const pet = getPet(petId);

			if (!pet) {
				return interaction.editReply({ content: "Unknown pet ID." });
			}

			const updated = await renamePet(interaction.user.id, petId, newName);
			if (!updated) {
				return interaction.editReply({ content: "You don't own a pet with that ID." });
			}

			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setDescription(`${pet.emoji} **${pet.name}** renamed to **${newName}**.`),
				],
			});
		}
	}
}
