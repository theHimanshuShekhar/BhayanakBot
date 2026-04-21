import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import type { AutocompleteInteraction } from "discord.js";
import { getHelpSnapshot } from "../../lib/help/collect.js";
import { buildCategoryPage, buildNotFoundFallback, buildOverview } from "../../lib/help/render.js";

export class HelpCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "help",
			description: "Browse all bot commands by category.",
			help: {
				summary: "Show the interactive command help menu.",
				examples: ["/help", "/help category:rpg"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("help")
				.setDescription("Browse all bot commands by category")
				.addStringOption((opt) =>
					opt
						.setName("category")
						.setDescription("Jump straight to a category")
						.setAutocomplete(true)
						.setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const snapshot = getHelpSnapshot();
		const categoryArg = interaction.options.getString("category");

		if (categoryArg) {
			const page = buildCategoryPage(snapshot, categoryArg, 0);
			if (page) {
				return interaction.reply({
					embeds: [page.embed],
					components: page.components,
					flags: MessageFlags.Ephemeral,
				});
			}
			const fallback = buildNotFoundFallback(snapshot, `category \`${categoryArg}\``);
			return interaction.reply({
				embeds: [fallback.embed],
				components: fallback.components,
				flags: MessageFlags.Ephemeral,
			});
		}

		const overview = buildOverview(snapshot);
		return interaction.reply({
			embeds: [overview.embed],
			components: overview.components,
			flags: MessageFlags.Ephemeral,
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name !== "category") return interaction.respond([]);
		const snapshot = getHelpSnapshot();
		const query = focused.value.toLowerCase();
		const matches = snapshot.categories
			.filter((c) => c.id.includes(query) || c.label.toLowerCase().includes(query))
			.slice(0, 25)
			.map((c) => ({ name: `${c.emoji} ${c.label}`, value: c.id }));
		return interaction.respond(matches);
	}
}
