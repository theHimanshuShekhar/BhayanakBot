/** Size a profile aims for (the prompts ask for it) and the hard cap enforced on what is stored. */
export const MAX_PROFILE_CHARS = 1500;

const SENTENCE_END = /[.!?]["')\]]*(?=\s|$)/g;

/**
 * Applies the hard size cap to a generated profile.
 *
 * Text within the cap is returned trimmed. Longer text is cut after the last complete sentence that fits, so a
 * profile never ends mid-sentence. Returns null when nothing usable is left: the text is empty, or no sentence
 * ends within the cap (one run-on sentence). The builders treat null like an empty model reply and keep the
 * previous profile.
 */
export function fitProfileToCap(text: string, maxChars: number = MAX_PROFILE_CHARS): string | null {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) return trimmed || null;

	let end = 0;
	for (const match of trimmed.matchAll(SENTENCE_END)) {
		const matchEnd = match.index + match[0].length;
		if (matchEnd > maxChars) break;
		end = matchEnd;
	}
	return end > 0 ? trimmed.slice(0, end) : null;
}
