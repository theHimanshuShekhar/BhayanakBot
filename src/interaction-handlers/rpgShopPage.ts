import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { buildShopPage } from "../commands/rpg/shop.js";

export class RpgShopPageHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith("rpgshop:")) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const [, direction, pageStr] = interaction.customId.split(":");
		const currentPage = parseInt(pageStr, 10);
		const newPage = direction === "next" ? currentPage + 1 : currentPage - 1;

		const { embed, row } = buildShopPage(newPage);
		return interaction.update({ embeds: [embed], components: [row] });
	}
}
