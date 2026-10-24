import { container } from "@sapphire/framework";
import type { Message } from "discord.js";
import { findMatchingResponse, type MatchResult } from "../../db/queries/autoResponses.js";
import type { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { decideReply, isBotMentioned, randomReplyChannelId, rollRandomReply } from "../autoresponder/decideReply.js";
import { beginAutoresponse, beginMention, beginRandom, recordChannelMessage } from "../autoresponder/replyGuard.js";
import { postReply, sendTyping, whileTyping } from "../autoresponder/sendReply.js";
import type { BhayanakClient } from "../BhayanakClient.js";
import { isHomeServer } from "../homeServer.js";
import { callBackgroundLlm, callInteractiveLlm } from "../llmProvider.js";
import { getPersonalityContext } from "../personality/getPersonalityContext.js";
import { displayNameOf, fetchConversation, resolveMentions } from "./conversation.js";
import { autoresponsePrompt, autoresponseSystem, botVoiceSystem, mentionPrompt, randomPrompt } from "./prompts.js";

type Settings = Awaited<ReturnType<typeof getOrCreateSettings>>;

function substituteVariables(text: string, captured?: Record<string, string>): string {
	if (!captured) return text;
	let result = text;
	for (const [key, value] of Object.entries(captured)) result = result.replaceAll(`{${key}}`, value);
	return result;
}

/**
 * Answers a message with at most one reply (the One Reply Rule): a matching autoresponse, else a Mention Reply,
 * else a Random Reply. Callers run it after auto-mod, so a moderated message never reaches it. A reply that
 * cannot be written or sent posts nothing and keeps the trigger.
 */
export async function answerMessage(message: Message<true>, settings: Settings): Promise<void> {
	const botMentioned = isBotMentioned(message);
	const home = isHomeServer(message.guild.id);
	// Every human message in the random-reply channel counts toward its activity, whoever answers it.
	const activity =
		home && message.channel.id === randomReplyChannelId(settings)
			? recordChannelMessage(message.channel.id, message.author.id)
			: null;
	const match = await findMatchingResponse(message.guild.id, message.content, message.channel.id, botMentioned);
	const decision = decideReply({
		match,
		isHomeServer: home,
		botMentioned,
		rollRandom: () =>
			activity !== null &&
			rollRandomReply(settings, message.channel.id, activity, {
				onSkip: (reason) =>
					container.logger.debug(
						`[random-reply] skip reason=${reason} channel=${message.channel.id} messages=${activity.messages} members=${activity.members} since=${activity.sinceLastReply}`,
					),
			}),
	});
	container.logger.debug(
		`[reply] decision=${decision.kind} guild=${message.guild.id} channel=${message.channel.id} message=${message.id} botMentioned=${botMentioned} homeServer=${home}`,
	);

	switch (decision.kind) {
		case "autoresponse":
			return answerWithAutoresponse(message, decision.match, botMentioned, home);
		case "mention":
			return answerWithMention(message);
		case "random":
			return answerWithRandom(message);
		case "none":
			return;
	}
}

async function answerWithAutoresponse(
	message: Message<true>,
	match: MatchResult,
	botMentioned: boolean,
	home: boolean,
): Promise<void> {
	const { response } = match;
	const isAi = response.responseType === "llm";
	if (isAi && !home) {
		// An AI rule's text is the administrator's prompt: outside the Home Server skip it, never post it.
		container.logger.debug(`[autoresponder] skip reason=ai-outside-home-server responseId=${response.id}`);
		return;
	}

	const gate = beginAutoresponse({
		guildId: message.guild.id,
		trigger: response.trigger,
		userId: message.author.id,
		botMentioned,
	});
	if (!gate.ok) {
		container.logger.debug(`[autoresponder] skip reason=${gate.reason} responseId=${response.id}`);
		return;
	}

	let sent = false;
	try {
		const text = isAi
			? await writeAiAutoresponse(message, match)
			: substituteVariables(response.response, match.captured);
		if (!text) return;
		// The trigger goes only once there is a reply to send.
		if (response.deleteTrigger) {
			await message
				.delete()
				.catch((err) => container.logger.warn(`[autoresponder] delete-trigger failed message=${message.id}:`, err));
		}
		sent = await postReply(message, text, !response.deleteTrigger);
	} finally {
		gate.finish(sent);
	}
}

/** The model's reply to an AI Autoresponse, or null when it returned nothing. Typing shows while it is written. */
async function writeAiAutoresponse(message: Message<true>, match: MatchResult): Promise<string | null> {
	const client = container.client as BhayanakClient;
	const botName = message.client.user.username;
	const reply = await whileTyping(message, async () => {
		const [personality, { conversation, participants }] = await Promise.all([
			getPersonalityContext(client, message.author.id, message.guild.id),
			fetchConversation(message, botName),
		]);
		const text = await callInteractiveLlm(
			autoresponseSystem({ adminPrompt: match.response.response, botName, personality }),
			autoresponsePrompt({ conversation, author: displayNameOf(message) }),
			"chat",
			{ session: `autoresponse:${message.channel.id}`, label: "autoresponse" },
		);
		return text && resolveMentions(text, participants, message.guild);
	});
	return reply ? substituteVariables(reply, match.captured) : null;
}

async function answerWithMention(message: Message<true>): Promise<void> {
	const gate = beginMention(message.guild.id, message.author.id);
	if (!gate.ok) {
		container.logger.debug(`[mention-reply] skip reason=${gate.reason} message=${message.id}`);
		return;
	}

	let sent = false;
	try {
		const client = container.client as BhayanakClient;
		const botName = message.client.user.username;
		const bare = message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "").trim() === "";
		const reply = await whileTyping(message, async () => {
			const [personality, { conversation, participants }] = await Promise.all([
				getPersonalityContext(client, message.author.id, message.guild.id),
				fetchConversation(message, botName),
			]);
			const text = await callInteractiveLlm(
				botVoiceSystem({ botName, guildName: message.guild.name, personality }),
				mentionPrompt({ conversation, author: displayNameOf(message), bare }),
				"chat",
				{ session: `mention:${message.channel.id}`, label: "mention-reply" },
			);
			return text && resolveMentions(text, participants, message.guild);
		});
		if (!reply) return;
		sent = await postReply(message, reply, true);
	} finally {
		gate.finish(sent);
	}
}

async function answerWithRandom(message: Message<true>): Promise<void> {
	const gate = beginRandom(message.channel.id);
	if (!gate.ok) {
		container.logger.debug(`[random-reply] skip reason=${gate.reason} message=${message.id}`);
		return;
	}

	let sent = false;
	try {
		const client = container.client as BhayanakClient;
		const botName = message.client.user.username;
		// The server culture profile only: nobody asked, so the member's own profile stays out of it.
		const [personality, { conversation, participants }] = await Promise.all([
			getPersonalityContext(client, message.author.id, message.guild.id, { memberProfile: false }),
			fetchConversation(message, botName),
		]);
		const text = await callBackgroundLlm(
			botVoiceSystem({ botName, guildName: message.guild.name, personality }),
			randomPrompt({ conversation }),
			"chat",
			{ session: `random:${message.channel.id}`, label: "random-reply" },
		);
		const reply = text && resolveMentions(text, participants, message.guild);
		if (!reply) return;
		// Typing starts only now that the text is ready.
		await sendTyping(message);
		sent = await postReply(message, reply, false);
	} finally {
		gate.finish(sent);
	}
}
