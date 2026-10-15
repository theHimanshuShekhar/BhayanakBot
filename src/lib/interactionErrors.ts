import { randomBytes } from "node:crypto";
import { container } from "@sapphire/framework";
import { type Interaction, MessageFlags } from "discord.js";

/** Short random ID shown to the member and logged next to the error so reports can be matched to a log line. */
export function createErrorReference(): string {
	return randomBytes(3).toString("hex");
}

/**
 * Answers an interaction whatever state it is in: ephemeral reply if nothing was sent yet, an edit if it was
 * deferred, an ephemeral follow-up if it already replied. Never throws; an expired interaction is only logged.
 */
export async function answerInteraction(interaction: Interaction, content: string): Promise<void> {
	if (!interaction.isRepliable()) return;
	try {
		// A deferred component update has no "thinking..." message; editing would overwrite the clicked message.
		const deferredUpdate = interaction.deferred && interaction.isMessageComponent();
		if (interaction.replied || deferredUpdate) {
			await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
		} else if (interaction.deferred) {
			await interaction.editReply({ content });
		} else {
			await interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}
	} catch (replyError) {
		container.logger.warn("[interaction-error] Could not answer interaction:", replyError);
	}
}

/** Logs an unexpected error with a fresh reference ID and tells the member only the reference, never the error. */
export async function reportInteractionError(interaction: Interaction, error: unknown, source: string): Promise<void> {
	const reference = createErrorReference();
	container.logger.error(`[interaction-error] Reference ${reference}: error in ${source}`, error);
	await answerInteraction(interaction, `Something went wrong. Reference: \`${reference}\``);
}

/** Shows a failed precondition's own message to the member. */
export async function reportInteractionDenied(interaction: Interaction, message: string): Promise<void> {
	await answerInteraction(interaction, message || "You can't do that right now.");
}
