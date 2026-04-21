import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { getHelpSnapshot } from "../lib/help/collect.js";
import { buildCategoryPage, buildNotFoundFallback, buildOverview } from "../lib/help/render.js";

export class HelpButtonsHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith("help:")) return this.none();
		// Exclude select-menu customIds that we also prefix with "help:" but route elsewhere.
		if (interaction.customId.startsWith("help:select:")) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const snapshot = getHelpSnapshot();
		const parts = interaction.customId.split(":");
		const action = parts[1];

		try {
			if (action === "home") {
				const page = buildOverview(snapshot);
				return await interaction.update({ embeds: [page.embed], components: page.components });
			}

			if (action === "cat") {
				const categoryId = parts[2];
				const pageNum = Number.parseInt(parts[3] ?? "0", 10) || 0;
				const page = categoryId ? buildCategoryPage(snapshot, categoryId, pageNum) : null;
				if (!page) {
					const fallback = buildNotFoundFallback(snapshot, `category \`${categoryId ?? "?"}\``);
					return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
				}
				return await interaction.update({ embeds: [page.embed], components: page.components });
			}

			// Unknown action — fall back to overview.
			const fallback = buildNotFoundFallback(snapshot, "that button");
			return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
		} catch (err) {
			// Stale ephemeral message after restart, or other non-fatal Discord errors — swallow.
			this.container.logger.debug("[help] button update failed:", err);
		}
	}
}
