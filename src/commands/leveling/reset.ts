import { Command } from "@sapphire/framework";
import { resetUser } from "../../db/queries/users.js";

export class ResetCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly", "IsAdmin"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("level-reset")
				.setDescription("Reset a user's XP and level (Admin)")
				.addUserOption((opt) => opt.setName("user").setDescription("User to reset").setRequired(true)),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const target = interaction.options.getUser("user", true);
		await resetUser(target.id, interaction.guildId!);
		return interaction.reply({ content: `Reset XP and level for ${target}.` });
	}
}
