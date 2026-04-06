import { Subcommand } from "@sapphire/plugin-subcommands";
import { EmbedBuilder , MessageFlags } from "discord.js";
import { addAutoResponse, removeAutoResponse, getGuildAutoResponses } from "../../db/queries/autoResponses.js";

export class AutoRespondCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "add", chatInputRun: "runAdd" },
				{ name: "remove", chatInputRun: "runRemove" },
				{ name: "list", chatInputRun: "runList" },
			],
			preconditions: ["GuildOnly", "IsAdmin"],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("autorespond")
				.setDescription("Manage auto-responses")
				.addSubcommand((sub) =>
					sub
						.setName("add")
						.setDescription("Add an auto-response trigger")
						.addStringOption((opt) => opt.setName("trigger").setDescription("Trigger text").setRequired(true))
						.addStringOption((opt) =>
							opt
								.setName("response")
								.setDescription("Static reply text, or the Ollama system prompt if use-llm is enabled")
								.setRequired(true),
						)
						.addStringOption((opt) =>
							opt
								.setName("match-type")
								.setDescription("How to match the trigger (default: contains)")
								.addChoices(
									{ name: "Exact match", value: "exact" },
									{ name: "Contains", value: "contains" },
									{ name: "Starts with", value: "startsWith" },
								)
								.setRequired(false),
						)
						.addBooleanOption((opt) =>
							opt
								.setName("use-llm")
								.setDescription("Generate a unique response via Ollama instead of replying with static text")
								.setRequired(false),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("remove")
						.setDescription("Remove an auto-response by trigger")
						.addStringOption((opt) => opt.setName("trigger").setDescription("Trigger to remove").setRequired(true)),
				)
				.addSubcommand((sub) => sub.setName("list").setDescription("List all auto-responses")),
		);
	}

	public async runAdd(interaction: Subcommand.ChatInputCommandInteraction) {
		const trigger = interaction.options.getString("trigger", true);
		const response = interaction.options.getString("response", true);
		const matchType = (interaction.options.getString("match-type") ?? "contains") as "exact" | "contains" | "startsWith";
		const useLlm = interaction.options.getBoolean("use-llm") ?? false;
		const responseType = useLlm ? "llm" : "static";

		await addAutoResponse({ guildId: interaction.guildId!, trigger, response, matchType, responseType });

		const typeTag = useLlm ? "[LLM]" : "[Static]";
		return interaction.reply({
			content: `Auto-response added: ${typeTag} \`${trigger}\` → \`${response}\` (match: ${matchType})`,
			flags: MessageFlags.Ephemeral,
		});
	}

	public async runRemove(interaction: Subcommand.ChatInputCommandInteraction) {
		const trigger = interaction.options.getString("trigger", true);
		const removed = await removeAutoResponse(interaction.guildId!, trigger);

		return interaction.reply({
			content: removed ? `Removed auto-response for \`${trigger}\`.` : `No auto-response found for \`${trigger}\`.`,
			flags: MessageFlags.Ephemeral,
		});
	}

	public async runList(interaction: Subcommand.ChatInputCommandInteraction) {
		const responses = await getGuildAutoResponses(interaction.guildId!);

		if (responses.length === 0) {
			return interaction.reply({ content: "No auto-responses configured.", flags: MessageFlags.Ephemeral });
		}

		const lines = responses.map((r) => {
			const typeTag = r.responseType === "llm" ? "[LLM]" : "[Static]";
			return `**${typeTag} [${r.matchType}]** \`${r.trigger}\` → ${r.response.slice(0, 60)}`;
		});

		const embed = new EmbedBuilder()
			.setTitle("Auto-Responses")
			.setDescription(lines.join("\n"))
			.setColor(0x5865f2);

		return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	}
}
