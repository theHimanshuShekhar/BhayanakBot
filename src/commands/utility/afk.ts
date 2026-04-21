import { MessageFlags } from "discord.js";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { setAfk, clearAfk } from "../../db/queries/afk.js";

export class AfkCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "set", chatInputRun: "runSet" },
				{ name: "clear", chatInputRun: "runClear" },
			],
			preconditions: ["GuildOnly"],
			help: {
				summary: "Manage your AFK status — set a message or clear it.",
				examples: ["/afk set reason:brb lunch", "/afk clear"],
				subcommands: {
					set: { summary: "Set yourself as AFK with an optional reason.", examples: ["/afk set reason:studying"] },
					clear: { summary: "Clear your AFK status manually.", examples: ["/afk clear"] },
				},
			},
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("afk")
				.setDescription("Manage your AFK status")
				.addSubcommand((sub) =>
					sub
						.setName("set")
						.setDescription("Set yourself as AFK")
						.addStringOption((opt) =>
							opt.setName("reason").setDescription("AFK reason").setRequired(false),
						),
				)
				.addSubcommand((sub) => sub.setName("clear").setDescription("Clear your AFK status manually")),
		);
	}

	public async runSet(interaction: Subcommand.ChatInputCommandInteraction) {
		const reason = interaction.options.getString("reason") ?? undefined;
		await setAfk(interaction.user.id, interaction.guildId!, reason);
		return interaction.reply({
			content: `You are now AFK${reason ? `: *${reason}*` : "."}`,
		});
	}

	public async runClear(interaction: Subcommand.ChatInputCommandInteraction) {
		await clearAfk(interaction.user.id, interaction.guildId!);
		return interaction.reply({ content: "Your AFK status has been cleared.", flags: MessageFlags.Ephemeral });
	}
}
