import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";
import { getActiveExpiredGiveaways, endGiveaway } from "../db/queries/giveaways.js";

export class EndGiveawaysTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "endGiveaways" });
	}

	public async run(): Promise<void> {
		const expired = await getActiveExpiredGiveaways();

		for (const giveaway of expired) {
			try {
				const entries = giveaway.entries as string[];
				const winnerCount = Math.min(giveaway.winnerCount, entries.length);
				const winners = [...entries].sort(() => Math.random() - 0.5).slice(0, winnerCount);

				await endGiveaway(giveaway.messageId, winners);

				const channel = await this.container.client.channels.fetch(giveaway.channelId).catch(() => null);
				if (channel && "send" in channel) {
					const winnerText = winners.length > 0 ? winners.map((w) => `<@${w}>`).join(", ") : "No valid entries";

					await (channel as TextChannel).send({
						content: `🎉 **Giveaway Ended!** Congratulations to ${winnerText}!\nPrize: **${giveaway.prize}**`,
					}).catch(() => null);

					const msg = await (channel as TextChannel).messages.fetch(giveaway.messageId).catch(() => null);
					if (msg) {
						const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setCustomId("giveaway:enter")
								.setLabel("Giveaway Ended")
								.setStyle(ButtonStyle.Secondary)
								.setEmoji("🎉")
								.setDisabled(true),
						);
						await msg.edit({ components: [row] }).catch(() => null);
					}
				}
			} catch (error) {
				this.container.logger.error(`[EndGiveaways] Failed to end giveaway ${giveaway.id}:`, error);
			}
		}
	}
}

declare module "@sapphire/plugin-scheduled-tasks" {
	interface ScheduledTasks {
		endGiveaways: never;
	}
}
