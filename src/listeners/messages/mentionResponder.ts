import { Listener } from "@sapphire/framework";
import { Events, type Message } from "discord.js";
import { callOllama } from "../../lib/ollama.js";

const HISTORY_LIMIT = 20;
const OLLAMA_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = [
	"You are a sarcastic, condescending, mildly contemptuous Discord bot who finds humans amusing but exhausting.",
	"You deliver short, sharp roasts — never explain your jokes, never apologize, never break character.",
	"You are speaking directly to the person who summoned you.",
	"Keep your response to 1-3 sentences maximum. Be punchy, not verbose.",
	"Do not start with greetings. Do not use quotation marks around your response.",
].join(" ");

export class MentionResponderListener extends Listener<typeof Events.MessageCreate> {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.MessageCreate });
	}

	public async run(message: Message): Promise<void> {
		if (message.author.bot) return;
		if (!message.inGuild()) return;
		if (!message.mentions.has(message.client.user)) return;

		// Strip the bot mention tag and check there's actual conversational content
		const contentWithoutMention = message.content
			.replace(/<@!?\d+>/g, "")
			.trim();
		if (!contentWithoutMention) return;

		const channel = message.channel;
		if (!channel.isTextBased()) return;

		const fetched = await channel.messages.fetch({ limit: HISTORY_LIMIT }).catch(() => null);
		if (!fetched) return;

		const history = [...fetched.values()]
			.reverse()
			.filter((m) => !m.author.bot && m.content.trim().length > 0)
			.map((m) => `${m.author.displayName}: ${m.content.trim()}`)
			.join("\n");

		const prompt = [
			"Here is the recent chat history for context:",
			history || "(no prior messages)",
			"",
			`"${message.author.displayName}" just summoned you by saying: "${contentWithoutMention}"`,
			"Respond directly to them. Be sarcastic and mocking.",
		].join("\n");

		await channel.sendTyping().catch(() => null);

		const response = await callOllama(SYSTEM_PROMPT, prompt, OLLAMA_TIMEOUT_MS);
		if (!response) return;

		await message.reply(response).catch(() => null);
	}
}
