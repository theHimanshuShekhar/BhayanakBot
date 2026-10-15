// A generated profile may describe how people write but must not reproduce what they wrote
// (CONTEXT.md, User Personality Profile). The prompt asks for that; this enforces it.

/** A run of this many consecutive words copied from one source message counts as a quote. */
export const QUOTE_RUN_WORDS = 8;

/** Lowercase, drop punctuation and emoji, split on whitespace, so formatting changes cannot hide a copy. */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.split(" ")
		.filter(Boolean);
}

function shingles(words: string[], size: number): string[] {
	const result: string[] = [];
	for (let start = 0; start + size <= words.length; start++) {
		result.push(words.slice(start, start + size).join(" "));
	}
	return result;
}

/**
 * True when `profile` contains `runWords` or more consecutive words that also appear, in the same order,
 * inside a single source message. Runs spanning two messages do not count. Ignores case and punctuation.
 */
export function quotesSource(profile: string, sources: readonly string[], runWords = QUOTE_RUN_WORDS): boolean {
	const profileShingles = shingles(tokenize(profile), runWords);
	if (profileShingles.length === 0) return false;

	// Shingles never span messages, so one set over all sources equals checking each message separately.
	const sourceShingles = new Set<string>();
	for (const source of sources) {
		for (const shingle of shingles(tokenize(source), runWords)) sourceShingles.add(shingle);
	}
	return profileShingles.some((shingle) => sourceShingles.has(shingle));
}
