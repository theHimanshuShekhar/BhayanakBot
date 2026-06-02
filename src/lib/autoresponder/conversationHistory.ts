import type { Client } from "discord.js";

const URL_PATTERN = /https?:\/\/\S+/g;
const USER_MENTION_PATTERN = /<@!?\d+>/g;
const BOT_COMMAND_PREFIX_PATTERN = /^\s*(?:[!/]|<@!?\d+>\s*[!/])/;
const MAX_USER_MENTIONS = 5;
export const CONVERSATION_HISTORY_LIMIT = 100;

export type ConversationHistoryMessage = {
	id: string;
	author: string;
	content: string;
	timestamp: number;
};

type ConversationMessageInput = {
	id: string;
	content: string;
	createdTimestamp?: number;
	author: {
		id: string;
		bot?: boolean;
	};
	mentions?: {
		users?: { size: number };
	};
};

type DebugLogger = { debug(message: string): unknown };

const conversationHistory = new Map<string, ConversationHistoryMessage[]>();

export function getConversationHistoryEligibilityReason(message: ConversationMessageInput): string | null {
	if (message.author.bot) return "bot-author";

	const trimmedContent = message.content.trim();
	if (!trimmedContent) return "empty-content";
	if (BOT_COMMAND_PREFIX_PATTERN.test(trimmedContent)) return "bot-command-prefix";
	if (trimmedContent.startsWith("?")) return "question-command-prefix";
	if (trimmedContent.includes("@everyone") || trimmedContent.includes("@here")) return "broadcast-mention";

	const userMentionCount = trimmedContent.match(USER_MENTION_PATTERN)?.length ?? 0;
	if ((message.mentions?.users?.size ?? 0) >= MAX_USER_MENTIONS || userMentionCount >= MAX_USER_MENTIONS) {
		return "too-many-user-mentions";
	}

	const contentWithoutUrls = trimmedContent.replace(URL_PATTERN, "").trim();
	const alphaCount = (contentWithoutUrls.match(/[A-Za-z]/g) ?? []).length;
	if (alphaCount < 2) return "low-alpha-content";

	return null;
}

export function isConversationHistoryEligible(message: ConversationMessageInput): boolean {
	return getConversationHistoryEligibilityReason(message) === null;
}

export function addConversationHistoryMessage(
	channelId: string,
	message: ConversationMessageInput,
	logger?: DebugLogger,
): void {
	const ineligibleReason = getConversationHistoryEligibilityReason(message);
	if (ineligibleReason) {
		logger?.debug(
			`[conversation-history] skip channel=${channelId} message=${message.id} author=${message.author.id} reason=${ineligibleReason} contentLength=${message.content.length}`,
		);
		return;
	}

	let history = conversationHistory.get(channelId);
	if (!history) {
		history = [];
		conversationHistory.set(channelId, history);
	}

	const existingIndex = history.findIndex((entry) => entry.id === message.id);
	if (existingIndex !== -1) {
		history.splice(existingIndex, 1);
		logger?.debug(
			`[conversation-history] replace channel=${channelId} message=${message.id} previousSize=${history.length + 1}`,
		);
	}

	history.push({
		id: message.id,
		author: `<@${message.author.id}>`,
		content: message.content.trim().slice(0, 500),
		timestamp: message.createdTimestamp ?? Date.now(),
	});

	let evictedCount = 0;
	while (history.length > CONVERSATION_HISTORY_LIMIT) {
		history.shift();
		evictedCount++;
	}
	logger?.debug(
		`[conversation-history] add channel=${channelId} message=${message.id} author=${message.author.id} size=${history.length}/${CONVERSATION_HISTORY_LIMIT} evicted=${evictedCount} contentLength=${message.content.length}`,
	);
}

export function getConversationContext(channelId: string, limit: number, excludeMessageId?: string): string {
	const history = conversationHistory.get(channelId);
	if (!history || history.length === 0) return "";
	return formatConversationContext(history.filter((message) => message.id !== excludeMessageId).slice(-limit));
}

export function getReplyAnchoredConversationContext(
	channelId: string,
	referencedMessageId: string | undefined,
	previousLimit: number,
): string | null {
	if (!referencedMessageId) return null;

	const history = conversationHistory.get(channelId);
	if (!history || history.length === 0) return null;

	const anchorIndex = history.findIndex((historyMessage) => historyMessage.id === referencedMessageId);
	if (anchorIndex === -1) return null;

	const startIndex = Math.max(0, anchorIndex - previousLimit);
	return formatConversationContext(history.slice(startIndex, anchorIndex + 1));
}

export function clearConversationHistoryForTests(): void {
	conversationHistory.clear();
}

export function getConversationHistorySizeForTests(channelId: string): number {
	return conversationHistory.get(channelId)?.length ?? 0;
}

export function getConversationContextMessageCount(context: string): number {
	if (!context) return 0;
	return context.split("\n").filter((line) => line.trim().length > 0).length;
}

export async function preloadConversationHistoryForChannels(
	client: Client,
	channelIds: Iterable<string>,
	logger: Pick<Client["logger"], "debug" | "warn">,
): Promise<void> {
	const uniqueChannelIds = [...new Set(channelIds)].filter((channelId) => channelId.length > 0);
	logger.debug(`[conversation-history] preload start channelCount=${uniqueChannelIds.length}`);
	for (const channelId of uniqueChannelIds) {
		try {
			logger.debug(`[conversation-history] preload fetch-channel channel=${channelId}`);
			const channel = await client.channels.fetch(channelId);
			if (!channel) {
				logger.debug(`[conversation-history] preload skip channel=${channelId} reason=not-found`);
				continue;
			}
			if (!("messages" in channel)) {
				logger.debug(`[conversation-history] preload skip channel=${channelId} reason=no-message-manager`);
				continue;
			}

			const fetchedMessages = await channel.messages.fetch({ limit: CONVERSATION_HISTORY_LIMIT, cache: false });
			logger.debug(`[conversation-history] preload fetched channel=${channelId} fetched=${fetchedMessages.size}`);
			const sortedMessages = [...fetchedMessages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
			for (const message of sortedMessages) {
				addConversationHistoryMessage(channelId, message, logger);
			}
			logger.debug(
				`[conversation-history] preload complete channel=${channelId} cached=${getConversationHistorySizeForTests(channelId)}`,
			);
		} catch (err) {
			logger.warn(`[conversation-history] Failed to preload channel=${channelId}:`, err);
		}
	}
}

function formatConversationContext(messages: ConversationHistoryMessage[]): string {
	return messages.map((m) => `${m.author}: ${m.content}`).join("\n");
}
