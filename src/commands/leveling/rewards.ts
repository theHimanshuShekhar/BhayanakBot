import { Subcommand } from "@sapphire/plugin-subcommands";
import { EmbedBuilder , MessageFlags } from "discord.js";
import { getLevelRewards, addLevelReward, removeLevelReward } from "../../db/queries/users.js";

export class RewardsCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "list", chatInputRun: "runList" },
				{ name: "add", chatInputRun: "runAdd" },
				{ name: "remove", chatInputRun: "runRemove" },
			],
			preconditions: ["GuildOnly"],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("rewards")
				.setDescription("Manage level-up role rewards")
				.addSubcommand((sub) => sub.setName("list").setDescription("List all level rewards"))
				.addSubcommand((sub) =>
					sub
						.setName("add")
						.setDescription("Add a role reward for a level (Admin)")
						.addIntegerOption((opt) =>
							opt.setName("level").setDescription("Level required").setMinValue(1).setRequired(true),
						)
						.addRoleOption((opt) => opt.setName("role").setDescription("Role to assign").setRequired(true)),
				)
				.addSubcommand((sub) =>
					sub
						.setName("remove")
						.setDescription("Remove a level reward (Admin)")
						.addIntegerOption((opt) =>
							opt.setName("level").setDescription("Level to remove reward from").setMinValue(1).setRequired(true),
						),
				),
		);
	}

	public async runList(interaction: Subcommand.ChatInputCommandInteraction) {
		const rewards = await getLevelRewards(interaction.guildId!);
		if (rewards.length === 0) {
			return interaction.reply({ content: "No level rewards configured.", flags: MessageFlags.Ephemeral });
		}

		const sorted = [...rewards].sort((a, b) => a.level - b.level);
		const lines = sorted.map((r) => `Level **${r.level}** → <@&${r.roleId}>`);

		const embed = new EmbedBuilder()
			.setTitle("Level Rewards")
			.setDescription(lines.join("\n"))
			.setColor(0x5865f2);

		return interaction.reply({ embeds: [embed] });
	}

	public async runAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		const member = interaction.guild!.members.cache.get(interaction.user.id);
		if (!member?.permissions.has("Administrator")) {
			return interaction.reply({ content: "You need Administrator permission.", flags: MessageFlags.Ephemeral });
		}

		const level = interaction.options.getInteger("level", true);
		const role = interaction.options.getRole("role", true);

		await addLevelReward(interaction.guildId!, level, role.id);
		return interaction.reply({ content: `Added <@&${role.id}> as a reward for reaching level **${level}**.` });
	}

	public async runRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		const member = interaction.guild!.members.cache.get(interaction.user.id);
		if (!member?.permissions.has("Administrator")) {
			return interaction.reply({ content: "You need Administrator permission.", flags: MessageFlags.Ephemeral });
		}

		const level = interaction.options.getInteger("level", true);
		await removeLevelReward(interaction.guildId!, level);
		return interaction.reply({ content: `Removed the level **${level}** reward.` });
	}
}
