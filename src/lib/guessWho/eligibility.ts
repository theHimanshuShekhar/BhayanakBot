const MIN_CONTENT_LENGTH = 15;
const MAX_CONTENT_LENGTH = 300;
const MIN_MESSAGE_AGE_MS = 60 * 60 * 1000;
const URL_ONLY_PATTERN = /^https?:\/\/\S+$/i;

export type GameEligibilityInput = {
	content: string;
	messageCreatedAt: Date;
};

export function isGameEligibleContent(input: GameEligibilityInput, now = new Date()): boolean {
	const content = input.content.trim();
	if (content.length < MIN_CONTENT_LENGTH || content.length > MAX_CONTENT_LENGTH) return false;
	if (content.startsWith("/") || content.startsWith("!")) return false;
	if (URL_ONLY_PATTERN.test(content)) return false;
	if (content.includes("@everyone") || content.includes("@here")) return false;
	if (now.getTime() - input.messageCreatedAt.getTime() < MIN_MESSAGE_AGE_MS) return false;
	return true;
}
