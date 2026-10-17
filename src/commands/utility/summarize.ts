import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";
import { HOME_SERVER_REGISTRATION } from "../../lib/homeServer.js";
import { callInteractiveLlm } from "../../lib/llmProvider.js";
import {
	fetchRecentMessages,
	formatCoverage,
	MAX_SUMMARY_MESSAGES,
	trimToBudget,
	truncateForEmbed,
} from "../../lib/summarize.js";

const COOLDOWN_MS = 10 * 60 * 1000;

const SYSTEM_PROMPT = [
	"You are a helpful assistant. Summarize the following Discord chat conversation concisely in bullet points.",
	"Use as many bullet points as needed to capture the conversation — fewer for short chats, more for long ones.",
	"Focus on key topics, decisions, and notable moments.",
	"Do not use quotation marks. Do not include greetings or preamble.",
].join(" ");

const TIME_MAP: Record<string, number> = {
	"15m": 15 * 60 * 1000,
	"30m": 30 * 60 * 1000,
	"1h": 60 * 60 * 1000,
	"2h": 2 * 60 * 60 * 1000,
	"6h": 6 * 60 * 60 * 1000,
	"24h": 24 * 60 * 60 * 1000,
};

function formatRemaining(expiry: number): string {
	const remainingSecs = Math.ceil((expiry - Date.now()) / 1000);
	const mins = Math.floor(remainingSecs / 60);
	const secs = remainingSecs % 60;
	return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export class SummarizeCommand extends Command {
	// Cooldowns are manual (not Sapphire's) because they must only be consumed when a summary is produced.
	// key -> expiry timestamp
	private readonly userCooldowns = new Map<string, number>();
	private readonly channelCooldowns = new Map<string, number>();
	// Users and channels with a summary being generated, so concurrent runs cannot both call the LLM.
	private readonly busyUsers = new Set<string>();
	private readonly busyChannels = new Set<string>();

	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly", "HomeServerOnly"],
			help: {
				summary: "Summarize recent messages in this channel using AI.",
				examples: ["/summarize", "/summarize count:100", "/summarize time:2h"],
				usageNotes: "Uses the configured AI provider. `time` overrides `count` if both are given.",
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName("summarize")
					.setDescription("Summarize recent messages in this channel using AI")
					.addIntegerOption((opt) =>
						opt
							.setName("count")
							.setDescription("Number of messages to summarize (default: 50)")
							.setMinValue(1)
							.setMaxValue(200)
							.setRequired(false),
					)
					.addStringOption((opt) =>
						opt
							.setName("time")
							.setDescription("Summarize messages from the past time window (overrides count)")
							.setRequired(false)
							.addChoices(
								{ name: "15 minutes", value: "15m" },
								{ name: "30 minutes", value: "30m" },
								{ name: "1 hour", value: "1h" },
								{ name: "2 hours", value: "2h" },
								{ name: "6 hours", value: "6h" },
								{ name: "24 hours", value: "24h" },
							),
					),
			HOME_SERVER_REGISTRATION,
		);
	}

	private activeCooldown(cooldowns: Map<string, number>, key: string): number | null {
		const expiry = cooldowns.get(key);
		if (expiry === undefined) return null;
		if (Date.now() >= expiry) {
			cooldowns.delete(key);
			return null;
		}
		return expiry;
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const userId = interaction.user.id;
		const channelId = interaction.channelId;

		const userExpiry = this.activeCooldown(this.userCooldowns, userId);
		if (userExpiry) {
			return interaction.reply({
				content: `⏳ You can summarize again in **${formatRemaining(userExpiry)}**.`,
				ephemeral: true,
			});
		}
		const channelExpiry = this.activeCooldown(this.channelCooldowns, channelId);
		if (channelExpiry) {
			return interaction.reply({
				content: `⏳ This channel's summary is on cooldown. Try again in **${formatRemaining(channelExpiry)}**.`,
				ephemeral: true,
			});
		}
		if (this.busyChannels.has(channelId) || this.busyUsers.has(userId)) {
			return interaction.reply({
				content: "⏳ A summary is already being generated. Try again in a moment.",
				ephemeral: true,
			});
		}

		this.busyChannels.add(channelId);
		this.busyUsers.add(userId);
		try {
			return await this.summarize(interaction);
		} finally {
			this.busyChannels.delete(channelId);
			this.busyUsers.delete(userId);
		}
	}

	private async summarize(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const channel = interaction.channel;
		if (!channel?.isTextBased()) {
			return interaction.editReply({ content: "❌ Cannot fetch messages from this channel." });
		}

		const timeChoice = interaction.options.getString("time");
		const count = interaction.options.getInteger("count") ?? 50;

		const fetched =
			timeChoice && TIME_MAP[timeChoice]
				? await fetchRecentMessages(channel, {
						limit: MAX_SUMMARY_MESSAGES,
						since: Date.now() - TIME_MAP[timeChoice],
					})
				: await fetchRecentMessages(channel, { limit: Math.min(count, MAX_SUMMARY_MESSAGES) });

		if (fetched.length === 0) {
			return interaction.editReply({ content: "📭 No messages found to summarize." });
		}

		const { messages, prompt } = trimToBudget(fetched);
		const summary = (
			await callInteractiveLlm(SYSTEM_PROMPT, prompt, "summary", {
				session: `summary:${channel.id}`,
				label: "summarize",
			})
		)?.trim();

		if (!summary) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setDescription("❌ Could not generate summary — AI service is unavailable. Try again in a moment."),
				],
			});
		}

		// Only a produced summary consumes the cooldowns.
		const expiry = Date.now() + COOLDOWN_MS;
		this.userCooldowns.set(interaction.user.id, expiry);
		this.channelCooldowns.set(interaction.channelId, expiry);

		const embed = new EmbedBuilder()
			.setTitle("📝 Channel Summary")
			.setDescription(truncateForEmbed(summary))
			.setColor(0x5865f2);

		return interaction.editReply({
			content: formatCoverage(messages.length, messages[0].createdTimestamp),
			embeds: [embed],
		});
	}
}
