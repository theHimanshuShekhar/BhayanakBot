import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { eq } from "drizzle-orm";
import { db } from "../lib/database.js";
import { polls } from "../db/schema.js";
import { vote } from "../db/queries/polls.js";

export class PollVoteButtonsHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith("poll_vote:")) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction) {
		const optionIndex = parseInt(interaction.customId.split(":")[1], 10);
		if (isNaN(optionIndex) || optionIndex < 0) {
			return interaction.reply({ content: "Invalid poll option.", flags: MessageFlags.Ephemeral });
		}

		const poll = await db.query.polls.findFirst({ where: eq(polls.messageId, interaction.message.id) });
		if (!poll) {
			return interaction.reply({ content: "Poll not found.", flags: MessageFlags.Ephemeral });
		}
		if (poll.closed) {
			return interaction.reply({ content: "This poll has already ended.", flags: MessageFlags.Ephemeral });
		}

		const optionData = poll.options as Array<{ label: string; votes: string[] }>;
		if (optionIndex >= optionData.length) {
			return interaction.reply({ content: "Invalid poll option.", flags: MessageFlags.Ephemeral });
		}

		const updatedPoll = await vote(poll.messageId, optionIndex, interaction.user.id);
		if (!updatedPoll) {
			return interaction.reply({ content: "Failed to record vote.", flags: MessageFlags.Ephemeral });
		}

		const updatedOptionData = updatedPoll.options as Array<{ label: string; votes: string[] }>;
		const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
		const totalVotes = updatedOptionData.reduce((sum, o) => sum + o.votes.length, 0);

		const embed = new EmbedBuilder()
			.setTitle("📊 " + updatedPoll.question)
			.setDescription(
				updatedOptionData
					.map((o, i) => `${emojis[i]} ${o.label} — **${o.votes.length}** vote${o.votes.length !== 1 ? "s" : ""}`)
					.join("\n"),
			)
			.setColor(0x5865f2)
			.setFooter({ text: `${totalVotes} total vote${totalVotes !== 1 ? "s" : ""}${updatedPoll.expiresAt ? ` · Ends ${updatedPoll.expiresAt.toUTCString()}` : ""}` });

		const buttons = updatedOptionData.map((o, i) =>
			new ButtonBuilder()
				.setCustomId(`poll_vote:${i}`)
				.setLabel(o.label.slice(0, 80))
				.setEmoji(emojis[i])
				.setStyle(ButtonStyle.Primary),
		);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

		await interaction.update({ embeds: [embed], components: [row] });
		return interaction.followUp({ content: `Voted for **${updatedOptionData[optionIndex]?.label}**!`, flags: MessageFlags.Ephemeral });
	}
}
