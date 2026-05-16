import { Subcommand } from "@sapphire/plugin-subcommands";
import { EmbedBuilder, MessageFlags } from "discord.js";
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
			help: {
				summary: "Add, remove, and list automatic keyword response triggers.",
				examples: [
					'/autorespond add trigger:"hello" response:"Hi there!"',
					'/autorespond add trigger:"^my name is (?<name>.+)$" response:"Nice to meet you, {name}!" use-regex:true',
					"/autorespond list",
					"/autorespond remove trigger:hello",
				],
				subcommands: {
					add: {
						summary: "Add a new auto-response trigger.",
						examples: [
							'/autorespond add trigger:"hello" response:"Hi there!"',
							'/autorespond add trigger:"bug" response:"Please file a bug report!" require-mention:true',
						],
					},
					remove: { summary: "Remove an auto-response by trigger.", examples: ["/autorespond remove trigger:hello"] },
					list: { summary: "List all configured auto-responses.", examples: ["/autorespond list"] },
				},
			},
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
						.addStringOption((opt) => opt.setName("trigger").setDescription("Trigger text or regex pattern").setRequired(true))
						.addStringOption((opt) =>
							opt
								.setName("response")
								.setDescription("Static reply, or Ollama system prompt if use-llm is enabled. Use {var} for regex captures.")
								.setRequired(true),
						)
						.addStringOption((opt) =>
							opt
								.setName("match-type")
								.setDescription("How to match the trigger (default: contains, ignored if use-regex is true)")
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
						)
						.addBooleanOption((opt) =>
							opt
								.setName("use-regex")
								.setDescription("Treat trigger as a regex pattern (supports named capture groups like (?<name>...))")
								.setRequired(false),
						)
						.addStringOption((opt) =>
							opt
								.setName("channels")
								.setDescription("Comma-separated channel IDs where this trigger is active (empty = all channels)")
								.setRequired(false),
						)
						.addBooleanOption((opt) =>
							opt
								.setName("require-mention")
								.setDescription("Only trigger when the bot is @mentioned")
								.setRequired(false),
						)
						.addIntegerOption((opt) =>
							opt
								.setName("chance")
								.setDescription("Percent chance to respond (1-100, default: 100)")
								.setMinValue(1)
								.setMaxValue(100)
								.setRequired(false),
						)
						.addBooleanOption((opt) =>
							opt
								.setName("delete-trigger")
								.setDescription("Delete the triggering message after responding")
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
		const useRegex = interaction.options.getBoolean("use-regex") ?? false;
		const channelsRaw = interaction.options.getString("channels");
		const requireMention = interaction.options.getBoolean("require-mention") ?? false;
		const chancePercent = interaction.options.getInteger("chance") ?? 100;
		const deleteTrigger = interaction.options.getBoolean("delete-trigger") ?? false;

		// Validate regex if enabled
		if (useRegex) {
			try {
				new RegExp(trigger);
			} catch {
				return interaction.reply({
					content: "❌ Invalid regex pattern. Please check your syntax.",
					flags: MessageFlags.Ephemeral,
				});
			}
		}

		const channelIds = channelsRaw
			? channelsRaw
					.split(",")
					.map((c) => c.trim())
					.filter((c) => c.length > 0)
			: [];

		await addAutoResponse({
			guildId: interaction.guildId!,
			trigger,
			response,
			matchType,
			responseType: useLlm ? "llm" : "static",
			useRegex,
			channelIds,
			requireMention,
			chancePercent,
			deleteTrigger,
		});

		const typeTag = useLlm ? "[LLM]" : "[Static]";
		const regexTag = useRegex ? " [Regex]" : "";
		const mentionTag = requireMention ? " [Mention]" : "";
		const deleteTag = deleteTrigger ? " [Delete]" : "";
		const chanceTag = chancePercent < 100 ? ` [${chancePercent}%]` : "";

		return interaction.reply({
			content: `Auto-response added: ${typeTag}${regexTag}${mentionTag}${deleteTag}${chanceTag} \`${trigger}\` → \`${response.slice(0, 60)}\``,
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
			const tags = [
				r.responseType === "llm" ? "LLM" : "Static",
				r.useRegex ? "Regex" : r.matchType,
				r.requireMention ? "Mention" : null,
				r.deleteTrigger ? "Delete" : null,
				r.chancePercent < 100 ? `${r.chancePercent}%` : null,
				r.channelIds.length > 0 ? `${r.channelIds.length}ch` : null,
			]
				.filter(Boolean)
				.join(" | ");
			return `[${tags}] \`${r.trigger}\` → ${r.response.slice(0, 50)}${r.response.length > 50 ? "…" : ""}`;
		});

		const embed = new EmbedBuilder()
			.setTitle("Auto-Responses")
			.setDescription(lines.join("\n"))
			.setColor(0x5865f2);

		return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	}
}
