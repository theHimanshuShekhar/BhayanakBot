import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { getOrCreateProfile, getOwnedPets, isInJail } from "../../db/queries/rpg.js";
import { getPet } from "../../lib/rpg/catalogs/pets.js";

export class ProfileCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("profile")
				.setDescription("View your RPG profile or another player's")
				.addUserOption((opt) =>
					opt.setName("user").setDescription("Player to view").setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();
		const target = interaction.options.getUser("user") ?? interaction.user;

		const { profile, stats } = await getOrCreateProfile(target.id);
		const ownedPets = await getOwnedPets(target.id);

		const statBar = (value: number) => {
			const filled = Math.min(10, Math.max(0, Math.round((value / 100) * 10)));
			return `\`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` ${value}/100`;
		};

		const jailed = isInJail(profile);
		const jailText =
			jailed && profile.jailUntil
				? `🔒 In jail until <t:${Math.floor(profile.jailUntil.getTime() / 1000)}:R>`
				: "🆓 Free";

		const xpForNextLevel = Math.pow((profile.level + 1) / 0.05, 2);
		const xpForCurrentLevel = Math.pow(profile.level / 0.05, 2);
		const progress = profile.xp - xpForCurrentLevel;
		const needed = xpForNextLevel - xpForCurrentLevel;
		const barFilled = Math.min(15, Math.max(0, Math.round((progress / needed) * 15)));
		const xpBar = `\`${"█".repeat(barFilled)}${"░".repeat(15 - barFilled)}\` ${Math.round(progress)}/${Math.round(needed)}`;

		const petDisplay =
			ownedPets.length > 0
				? ownedPets
						.slice(0, 3)
						.map((op) => {
							const pet = getPet(op.petId);
							return `${pet?.emoji ?? "🐾"} ${op.nickname ?? pet?.name ?? op.petId}`;
						})
						.join(", ") + (ownedPets.length > 3 ? ` +${ownedPets.length - 3} more` : "")
				: "None";

		const embed = new EmbedBuilder()
			.setTitle(`${target.displayName}'s RPG Profile`)
			.setThumbnail(target.displayAvatarURL())
			.setColor(0x5865f2)
			.addFields(
				{ name: "💰 Coins", value: `${profile.coins.toLocaleString()}`, inline: true },
				{ name: "⭐ Level", value: `${profile.level}`, inline: true },
				{ name: "🔑 Status", value: jailText, inline: true },
				{ name: `📈 XP Progress to Level ${profile.level + 1}`, value: xpBar },
				{ name: "⚔️ Strength", value: statBar(stats.strength), inline: true },
				{ name: "🧠 Intelligence", value: statBar(stats.intelligence), inline: true },
				{ name: "💨 Agility", value: statBar(stats.agility), inline: true },
				{ name: "🗣️ Charisma", value: statBar(stats.charisma), inline: true },
				{ name: "🍀 Luck", value: statBar(stats.luck), inline: true },
				{ name: "🐾 Pets", value: petDisplay, inline: true },
			)
			.setFooter({ text: `Total XP: ${profile.xp.toLocaleString()}` });

		return interaction.editReply({ embeds: [embed] });
	}
}
