import { Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, PermissionFlagsBits, TextChannel } from "discord.js";

export class PurgeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, name: "purge", description: "Delete multiple messages", preconditions: ["GuildOnly", "IsModerator"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("purge")
				.setDescription("Bulk delete messages from a channel")
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
				.addIntegerOption((opt) =>
					opt.setName("amount").setDescription("Number of messages to delete (1-100)").setRequired(true).setMinValue(1).setMaxValue(100),
				)
				.addUserOption((opt) => opt.setName("user").setDescription("Only delete messages from this user")),
		);
	}

	public async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });
		const amount = interaction.options.getInteger("amount", true);
		const targetUser = interaction.options.getUser("user");
		const channel = interaction.channel as TextChannel;

		try {
			const messages = await channel.messages.fetch({ limit: 100 });
			let toDelete = [...messages.values()].slice(0, amount);

			if (targetUser) {
				toDelete = toDelete.filter((m) => m.author.id === targetUser.id);
			}

			// Discord only allows bulk delete for messages < 14 days old
			const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
			toDelete = toDelete.filter((m) => m.createdTimestamp > twoWeeksAgo);

			if (toDelete.length === 0) return interaction.editReply("❌ No eligible messages found to delete.");

			const deleted = await channel.bulkDelete(toDelete, true);
			return interaction.editReply(`✅ Deleted **${deleted.size}** messages.`);
		} catch {
			return interaction.editReply("❌ Failed to delete messages. I may lack permissions.");
		}
	}
}
