export function formatPlayerError(err: unknown): string {
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		if (msg.includes("no results") || msg.includes("could not extract") || msg.includes("no tracks")) {
			return "No results found. Try a different search query.";
		}
		if (msg.includes("age restricted") || msg.includes("age-restricted")) {
			return "This content is age-restricted and cannot be played.";
		}
		if (msg.includes("private") || msg.includes("unavailable")) {
			return "This content is private or unavailable.";
		}
		if (msg.includes("copyright") || msg.includes("blocked")) {
			return "This content is blocked due to copyright restrictions.";
		}
		if (msg.includes("timeout") || msg.includes("timed out")) {
			return "Request timed out. Please try again.";
		}
		return err.message;
	}
	return "An unknown error occurred.";
}
