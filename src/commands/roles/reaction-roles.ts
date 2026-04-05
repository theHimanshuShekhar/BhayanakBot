import { Subcommand } from "@sapphire/plugin-subcommands";
import { addReactionRole, removeReactionRole } from "../../db/queries/roles.js";

export class ReactionRolesCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "add", chatInputRun: "runAdd" },
				{ name: "remove", chatInputRun: "runRemove" },
			],
			preconditions: ["GuildOnly", "IsAdmin"],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("reactionrole")
				.setDescription("Manage reaction roles")
				.addSubcommand((sub) =>
					sub
						.setName("add")
						.setDescription("Add a reaction role to a message")
						.addStringOption((opt) =>
							opt.setName("message-id").setDescription("Message ID to attach the role to").setRequired(true),
						)
						.addStringOption((opt) => opt.setName("emoji").setDescription("Emoji to react with").setRequired(true))
						.addRoleOption((opt) => opt.setName("role").setDescription("Role to assign").setRequired(true))
						.addStringOption((opt) =>
							opt
								.setName("type")
								.setDescription("Role type (default: normal)")
								.addChoices(
									{ name: "Normal", value: "normal" },
									{ name: "Toggle (remove if already has)", value: "toggle" },
									{ name: "Unique (only one per group)", value: "unique" },
								)
								.setRequired(false),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("remove")
						.setDescription("Remove a reaction role from a message")
						.addStringOption((opt) =>
							opt.setName("message-id").setDescription("Message ID").setRequired(true),
						)
						.addStringOption((opt) =>
							opt.setName("emoji").setDescription("Emoji to remove").setRequired(true),
						),
				),
		);
	}

	public async runAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		const messageId = interaction.options.getString("message-id", true);
		const emoji = interaction.options.getString("emoji", true);
		const role = interaction.options.getRole("role", true);
		const type = (interaction.options.getString("type") ?? "normal") as "normal" | "toggle" | "unique";

		await addReactionRole({
			messageId,
			emoji,
			roleId: role.id,
			guildId: interaction.guildId!,
			type,
		});

		return interaction.reply({
			content: `Added reaction role: react with ${emoji} on message \`${messageId}\` to get <@&${role.id}>.`,
			ephemeral: true,
		});
	}

	public async runRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		const messageId = interaction.options.getString("message-id", true);
		const emoji = interaction.options.getString("emoji", true);

		await removeReactionRole(messageId, emoji);
		return interaction.reply({ content: `Removed reaction role for ${emoji} on message \`${messageId}\`.`, ephemeral: true });
	}
}
