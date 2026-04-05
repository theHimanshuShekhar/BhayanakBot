import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from "discord.js";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { db } from "../lib/database.js";
import { polls } from "../db/schema.js";

export class EndPollsTask extends ScheduledTask {
	public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
		super(context, { ...options, name: "endPolls" });
	}

	public async run(): Promise<void> {
		const expiredPolls = await db.query.polls.findMany({
			where: and(eq(polls.closed, false), isNotNull(polls.expiresAt), lte(polls.expiresAt, new Date())),
		});

		for (const poll of expiredPolls) {
			try {
				await db.update(polls).set({ closed: true }).where(eq(polls.id, poll.id));

				const optionData = poll.options as Array<{ label: string; votes: string[] }>;
				const totalVotes = optionData.reduce((sum, o) => sum + o.votes.length, 0);
				const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

				const sorted = [...optionData].sort((a, b) => b.votes.length - a.votes.length);
				const winner = sorted[0];

				const embed = new EmbedBuilder()
					.setTitle("📊 Poll Ended — " + poll.question)
					.setDescription(
						optionData
							.map((o, i) => {
								const pct = totalVotes > 0 ? Math.round((o.votes.length / totalVotes) * 100) : 0;
								return `${emojis[i]} ${o.label} — **${o.votes.length}** vote${o.votes.length !== 1 ? "s" : ""} (${pct}%)`;
							})
							.join("\n"),
					)
					.setColor(0x57f287)
					.setFooter({ text: `Winner: ${winner?.label ?? "Tie"} · ${totalVotes} total vote${totalVotes !== 1 ? "s" : ""}` });

				const channel = await this.container.client.channels.fetch(poll.channelId).catch(() => null);
				if (channel && "send" in channel) {
					// Update original message
					const msg = await (channel as TextChannel).messages.fetch(poll.messageId).catch(() => null);
					if (msg) {
						const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
							...optionData.map((o, i) =>
								new ButtonBuilder()
									.setCustomId(`poll_vote:${i}`)
									.setLabel(o.label.slice(0, 80))
									.setEmoji(emojis[i])
									.setStyle(ButtonStyle.Secondary)
									.setDisabled(true),
							),
						);
						await msg.edit({ embeds: [embed], components: [disabledRow] }).catch(() => null);
					}

					await (channel as TextChannel).send({ content: "Poll has ended!", embeds: [embed] }).catch(() => null);
				}
			} catch (error) {
				this.container.logger.error(`[EndPolls] Failed to end poll #${poll.id}:`, error);
			}
		}
	}
}

declare module "@sapphire/plugin-scheduled-tasks" {
	interface ScheduledTasks {
		endPolls: never;
	}
}
