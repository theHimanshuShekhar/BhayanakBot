import { BucketScope, Command } from "@sapphire/framework";
import { EmbedBuilder, SnowflakeUtil, type TextBasedChannel } from "discord.js";
import { callOllama } from "../../lib/ollama.js";

const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_MESSAGES = 200;
const OLLAMA_TIMEOUT_MS = 300_000;

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

// Per-channel cooldown: channelId -> expiry timestamp
const channelCooldowns = new Map<string, number>();

async function fetchMessagesByCount(channel: TextBasedChannel, count: number): Promise<string[]> {
	const messages: string[] = [];
	let before: string | undefined;
	let remaining = Math.min(count, MAX_MESSAGES);

	while (remaining > 0) {
		const limit = Math.min(remaining, 100);
		const fetched = await channel.messages.fetch({ limit, ...(before ? { before } : {}) }).catch(() => null);
		if (!fetched || fetched.size === 0) break;

		const batch = [...fetched.values()]
			.filter((m) => !m.author.bot && m.content.trim().length > 0)
			.map((m) => `${m.author.displayName}: ${m.content.trim()}`);
		messages.push(...batch);

		before = fetched.last()?.id;
		remaining -= fetched.size;
		if (fetched.size < limit) break;
	}

	return messages.reverse();
}

async function fetchMessagesByTime(channel: TextBasedChannel, windowMs: number): Promise<string[]> {
	const since = Date.now() - windowMs;
	const afterSnowflake = SnowflakeUtil.generate({ timestamp: since }).toString();
	const messages: string[] = [];
	let after: string = afterSnowflake;

	while (messages.length < MAX_MESSAGES) {
		const fetched = await channel.messages.fetch({ limit: 100, after }).catch(() => null);
		if (!fetched || fetched.size === 0) break;

		// Messages fetched with `after` come back newest-first; filter to window
		const batch = [...fetched.values()]
			.filter((m) => m.createdTimestamp >= since && !m.author.bot && m.content.trim().length > 0)
			.map((m) => `${m.author.displayName}: ${m.content.trim()}`);
		messages.push(...batch);

		// If we got a full page and haven't hit the cap, paginate forward
		if (fetched.size < 100) break;
		after = fetched.first()!.id;
	}

	return messages.reverse();
}

export class SummarizeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			cooldownDelay: COOLDOWN_MS,
			cooldownScope: BucketScope.User,
			cooldownLimit: 1,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
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
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		// Per-channel cooldown check
		const channelExpiry = channelCooldowns.get(interaction.channelId);
		if (channelExpiry && Date.now() < channelExpiry) {
			const remainingSecs = Math.ceil((channelExpiry - Date.now()) / 1000);
			const mins = Math.floor(remainingSecs / 60);
			const secs = remainingSecs % 60;
			const remaining = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
			return interaction.reply({
				content: `⏳ This channel's summary is on cooldown. Try again in **${remaining}**.`,
				ephemeral: true,
			});
		}

		await interaction.deferReply();

		const channel = interaction.channel;
		if (!channel?.isTextBased()) {
			return interaction.editReply({ content: "❌ Cannot fetch messages from this channel." });
		}

		const timeChoice = interaction.options.getString("time");
		const count = interaction.options.getInteger("count") ?? 50;

		let messages: string[];
		let footerLabel: string;

		if (timeChoice && TIME_MAP[timeChoice]) {
			const windowMs = TIME_MAP[timeChoice];
			messages = await fetchMessagesByTime(channel, windowMs);
			footerLabel = `past ${timeChoice}`;
		} else {
			messages = await fetchMessagesByCount(channel, count);
			footerLabel = `last ${count} messages`;
		}

		if (messages.length === 0) {
			return interaction.editReply({ content: "📭 No messages found to summarize." });
		}

		const prompt = messages.join("\n");
		const summary = await callOllama(SYSTEM_PROMPT, prompt, OLLAMA_TIMEOUT_MS);

		if (!summary) {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setDescription("❌ Could not generate summary — AI service is unavailable. Try again in a moment."),
				],
			});
		}

		// Set per-channel cooldown
		channelCooldowns.set(interaction.channelId, Date.now() + COOLDOWN_MS);
		setTimeout(() => channelCooldowns.delete(interaction.channelId), COOLDOWN_MS);

		const embed = new EmbedBuilder()
			.setTitle("📝 Channel Summary")
			.setDescription(summary)
			.setColor(0x5865f2)
			.setFooter({ text: `Summarized ${messages.length} messages • ${footerLabel}` });

		return interaction.editReply({ embeds: [embed] });
	}
}
