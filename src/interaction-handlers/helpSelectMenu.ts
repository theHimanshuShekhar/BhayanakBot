import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { getHelpSnapshot } from "../lib/help/collect.js";
import { buildCategoryPage, buildCommandDetail, buildNotFoundFallback } from "../lib/help/render.js";

export class HelpSelectMenuHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.customId.startsWith("help:select:")) return this.none();
		return this.some();
	}

	public override async run(interaction: StringSelectMenuInteraction) {
		const snapshot = getHelpSnapshot();
		const parts = interaction.customId.split(":");
		const kind = parts[2];

		try {
			if (kind === "cat") {
				const selectedCategoryId = interaction.values[0];
				if (!selectedCategoryId) return;
				const page = buildCategoryPage(snapshot, selectedCategoryId, 0);
				if (!page) {
					const fallback = buildNotFoundFallback(snapshot, `category \`${selectedCategoryId}\``);
					return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
				}
				return await interaction.update({ embeds: [page.embed], components: page.components });
			}

			if (kind === "cmd") {
				const categoryId = parts[3] ?? null;
				const backPage = Number.parseInt(parts[4] ?? "0", 10) || 0;
				const selectedCommand = interaction.values[0];
				if (!selectedCommand) return;
				const detail = buildCommandDetail(snapshot, selectedCommand, categoryId, backPage);
				if (!detail) {
					const fallback = buildNotFoundFallback(snapshot, `command \`/${selectedCommand}\``);
					return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
				}
				return await interaction.update({ embeds: [detail.embed], components: detail.components });
			}

			const fallback = buildNotFoundFallback(snapshot, "that selection");
			return await interaction.update({ embeds: [fallback.embed], components: fallback.components });
		} catch (err) {
			this.container.logger.debug("[help] select-menu update failed:", err);
		}
	}
}
