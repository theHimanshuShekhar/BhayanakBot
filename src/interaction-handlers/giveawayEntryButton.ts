import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { addEntry, getGiveawayByMessage } from "../db/queries/giveaways.js";

export class GiveawayEntryButtonHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (interaction.customId !== "giveaway:enter") return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const giveaway = await getGiveawayByMessage(interaction.message.id);
		if (!giveaway || giveaway.ended) {
			return interaction.reply({ content: "This giveaway has already ended.", flags: MessageFlags.Ephemeral });
		}

		const updated = await addEntry(interaction.message.id, interaction.user.id);
		if (!updated) {
			return interaction.reply({ content: "Could not enter the giveaway.", flags: MessageFlags.Ephemeral });
		}

		const entries = updated.entries as string[];
		const entryCount = entries.length;

		return interaction.reply({
			content: `You've entered the giveaway for **${updated.prize}**! 🎉 (${entryCount} ${entryCount === 1 ? "entry" : "entries"})`,
			flags: MessageFlags.Ephemeral,
		});
	}
}
