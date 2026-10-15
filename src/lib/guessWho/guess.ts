const EXPLICIT_USER_MENTION_PATTERN = /<@!?(\d+)>/;

/**
 * The user a message guesses, or null if it is not a Guess Who Guess. Only a mention typed in the text counts:
 * the automatic mention Discord adds when replying shows up in `message.mentions` but never in the content.
 */
export function getGuessedUserId(content: string): string | null {
	return EXPLICIT_USER_MENTION_PATTERN.exec(content)?.[1] ?? null;
}
