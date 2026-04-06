import { Listener } from "@sapphire/framework";
import { Events, type Message } from "discord.js";
import { callOllama } from "../../lib/ollama.js";

const TARGET_CHANNEL_ID = "199168135935295488";
const HISTORY_LIMIT = 20;
const OLLAMA_TIMEOUT_MS = 60_000;

const PERSONALITIES = [
	"a passive-aggressive Reddit commenter with downvote energy and 'this is fine' irony",
	"a conspiracy theorist who connects unrelated things and believes 'they don't want you to know'",
	"a dark stand-up comedian who makes light of suffering with dry gallows humor",
	"a Gen Z person with severe brainrot — says 'no cap', 'it's giving', 'slay', chaotic short-attention-span energy",
	"an overly philosophical person who misapplies Nietzsche and Camus to mundane situations",
	"an unhinged sports commentator treating this chat like a live playoff game",
];

const FORMATS = [
	"a single punchy one-liner joke or observation",
	"a fake breaking news headline about this specific conversation",
	"a haiku (loosely 5-7-5) about what is being discussed",
	"a chaotic tweet under 280 characters with unhinged hashtags about the topic",
	"a 2-sentence pedantic 'well actually' unsolicited take on the topic",
	"a dry Wikipedia-style opening sentence describing the conversation topic as if it were an encyclopedia entry",
];

export class RandomResponderListener extends Listener<typeof Events.MessageCreate> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.MessageCreate });
	}

	public async run(message: Message): Promise<void> {
		if (message.author.bot) return;
		if (message.channelId !== TARGET_CHANNEL_ID) return;

		// Variable ~1% average chance: P(X < Y * 0.02) = 1% for uniform X, Y
		const chance = Math.random() * 0.02;
		if (Math.random() >= chance) return;

		const channel = message.channel;
		if (!channel.isTextBased()) return;

		// Fetch recent message history for context
		const fetched = await channel.messages.fetch({ limit: HISTORY_LIMIT }).catch(() => null);
		if (!fetched) return;

		// Format history oldest-first, skip bots and empty messages
		const history = [...fetched.values()]
			.reverse()
			.filter((m) => !m.author.bot && m.content.trim().length > 0)
			.map((m) => `${m.author.displayName}: ${m.content.trim()}`)
			.join("\n");

		if (!history) return;

		const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
		const format = FORMATS[Math.floor(Math.random() * FORMATS.length)];

		const system = [
			`You are ${personality}.`,
			`Respond using this exact format: ${format}.`,
			"Your response MUST be directly about the specific topic or subject being discussed in the chat — not generic commentary.",
			"Keep it under 280 characters unless the format requires slightly more.",
			"Do not greet anyone. Do not explain yourself. Do not break character. Just respond.",
		].join(" ");

		const prompt = [
			"Here is the recent chat history:",
			history,
			"",
			"Respond to what is being discussed. Stay in character. Be funny or darkly humorous. Respond to the actual topic.",
		].join("\n");

		await channel.sendTyping().catch(() => null);

		const response = await callOllama(system, prompt, OLLAMA_TIMEOUT_MS);
		if (!response) return;

		await message.channel.send(response).catch(() => null);
	}
}
