export const GUESS_WHO_MAX_WRONG_GUESSES = 3;
export const GUESS_WHO_TIMEOUT_MS = 10 * 60 * 1000;

export type GuessWhoSession = {
	channelId: string;
	messageId: string;
	authorUserId: string;
	wrongGuesses: number;
	timeout: NodeJS.Timeout;
};

const sessions = new Map<string, GuessWhoSession>();

export function getGuessWhoSession(channelId: string): GuessWhoSession | undefined {
	return sessions.get(channelId);
}

export function createGuessWhoSession(session: GuessWhoSession): GuessWhoSession {
	if (sessions.has(session.channelId)) {
		throw new Error("A Guess Who round is already active in this channel.");
	}
	sessions.set(session.channelId, session);
	return session;
}

export function clearGuessWhoSession(channelId: string): void {
	const session = sessions.get(channelId);
	if (session) clearTimeout(session.timeout);
	sessions.delete(channelId);
}

export function recordWrongGuess(channelId: string): {
	wrongGuesses: number;
	remainingGuesses: number;
	exhausted: boolean;
} {
	const session = sessions.get(channelId);
	if (!session) throw new Error(`No active Guess Who session for channel ${channelId}`);
	session.wrongGuesses++;
	const remainingGuesses = Math.max(0, GUESS_WHO_MAX_WRONG_GUESSES - session.wrongGuesses);
	return {
		wrongGuesses: session.wrongGuesses,
		remainingGuesses,
		exhausted: remainingGuesses === 0,
	};
}
