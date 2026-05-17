import { Listener } from "@sapphire/framework";
import { Events, type Message } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";
import { callOllama } from "../../lib/ollama.js";
import { getPersonalityContext } from "../../lib/personality/getPersonalityContext.js";

const HISTORY_LIMIT = 20;
const OLLAMA_TIMEOUT_MS = 60_000;
const MENTION_COOLDOWN_MS = 10 * 1000; // 10 seconds per user
const mentionCooldown = new Map<string, number>();

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

		// Skip if personality profiling is enabled — messageCreate.ts handles smart mentions instead
		const settings = await getOrCreateSettings(message.guildId!);
		if (settings.personalityEnabled) return;

		// Per-user cooldown to prevent Ollama spam
		const cooldownKey = `${message.guildId!}:${message.author.id}`;
		const lastFired = mentionCooldown.get(cooldownKey) ?? 0;
		if (Date.now() - lastFired < MENTION_COOLDOWN_MS) return;
		mentionCooldown.set(cooldownKey, Date.now());

		// Strip the bot mention tag and check there's actual conversational content
		const contentWithoutMention = message.content.replace(/<@!?\d+>/g, "").trim();
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

		const client = message.client as BhayanakClient;
		const personalityCtx = await getPersonalityContext(client, message.author.id, message.guildId!);
		const systemWithPersonality = personalityCtx + SYSTEM_PROMPT;

		const response = await callOllama(systemWithPersonality, prompt, OLLAMA_TIMEOUT_MS, 160);
		if (!response) return;

		const safeResponse = response.length > 1990 ? `${response.slice(0, 1989)}…` : response;
		if (safeResponse.length !== response.length) {
			this.container.logger.warn(
				`[mentionResponder] reply truncated from ${response.length} to ${safeResponse.length} chars`,
			);
		}
		await message
			.reply(safeResponse)
			.catch((err) => this.container.logger.warn(`[mentionResponder] reply send failed:`, err));
	}
}
