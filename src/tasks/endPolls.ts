import { container } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type TextChannel } from "discord.js";
import { closePoll, getActiveExpiredPolls } from "../db/queries/polls.js";
import type { TaskDefinition } from "./scheduler.js";

/** A poll whose results cannot be posted is retried every tick for this long after it expired, then given up on. */
export const POLL_ANNOUNCE_RETRY_WINDOW_MS = 30 * 60 * 1000;

export const endPolls: TaskDefinition = {
	name: "endPolls",
	intervalMs: 30_000,
	runOnStartup: true,
	async run() {
		const expiredPolls = await getActiveExpiredPolls();

		for (const poll of expiredPolls) {
			try {
				const optionData = poll.options as Array<{ label: string; votes: string[] }>;
				const totalVotes = optionData.reduce((sum, o) => sum + o.votes.length, 0);
				const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

				const sorted = [...optionData].sort((a, b) => b.votes.length - a.votes.length);
				const winner = sorted[0];

				const embed = new EmbedBuilder()
					.setTitle(`📊 Poll Ended — ${poll.question}`)
					.setDescription(
						optionData
							.map((o, i) => {
								const pct = totalVotes > 0 ? Math.round((o.votes.length / totalVotes) * 100) : 0;
								return `${emojis[i]} ${o.label} — **${o.votes.length}** vote${o.votes.length !== 1 ? "s" : ""} (${pct}%)`;
							})
							.join("\n"),
					)
					.setColor(0x57f287)
					.setFooter({
						text: `Winner: ${winner?.label ?? "Tie"} · ${totalVotes} total vote${totalVotes !== 1 ? "s" : ""}`,
					});

				// The poll only counts as ended once its results are posted; until then the next tick tries again.
				const channel = await container.client.channels.fetch(poll.channelId);
				if (!channel || !("send" in channel)) throw new Error(`channel ${poll.channelId} cannot be posted to`);
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

				await (channel as TextChannel).send({ content: "Poll has ended!", embeds: [embed] });
				await closePoll(poll.messageId);
			} catch (error) {
				const expiredFor = Date.now() - (poll.expiresAt?.getTime() ?? 0);
				if (expiredFor >= POLL_ANNOUNCE_RETRY_WINDOW_MS) {
					await closePoll(poll.messageId);
					container.logger.error(`[EndPolls] Giving up on announcing poll #${poll.id}:`, error);
				} else {
					container.logger.warn(`[EndPolls] Could not announce poll #${poll.id}; will retry:`, error);
				}
			}
		}
	},
};
