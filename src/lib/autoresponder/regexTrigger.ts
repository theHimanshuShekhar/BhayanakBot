import { container } from "@sapphire/framework";
import { RE2JS } from "re2js";

// Admin-supplied regex triggers run on every guild message, on the bot's single thread. RE2JS matches in linear time,
// so a catastrophic pattern such as (a+)+$ cannot block the bot; the length caps bound the remaining work.
export const MAX_REGEX_PATTERN_LENGTH = 100;
export const MAX_REGEX_INPUT_LENGTH = 2000;
const MAX_CACHE_ENTRIES = 500;

export interface RegexTrigger {
	id: number;
	guildId: string;
	trigger: string;
}

export type RegexValidation = { ok: true } | { ok: false; reason: string };

// A null pattern marks a stored trigger that failed validation; it is cached so it is skipped and logged only once.
const cache = new Map<number, { source: string; pattern: RE2JS | null }>();

function compile(source: string): { pattern: RE2JS } | { reason: string } {
	if (source.length > MAX_REGEX_PATTERN_LENGTH) {
		return { reason: `Pattern is longer than ${MAX_REGEX_PATTERN_LENGTH} characters.` };
	}
	try {
		return { pattern: RE2JS.compile(source, RE2JS.CASE_INSENSITIVE) };
	} catch (error) {
		return { reason: error instanceof Error ? error.message : String(error) };
	}
}

export function validateRegexTrigger(source: string): RegexValidation {
	const result = compile(source);
	return "pattern" in result ? { ok: true } : { ok: false, reason: result.reason };
}

function getPattern(trigger: RegexTrigger): RE2JS | null {
	const cached = cache.get(trigger.id);
	if (cached && cached.source === trigger.trigger) return cached.pattern;

	const result = compile(trigger.trigger);
	let pattern: RE2JS | null = null;
	if ("pattern" in result) {
		pattern = result.pattern;
	} else {
		container.logger.warn(
			`[autoresponder] regex trigger disabled guild=${trigger.guildId} id=${trigger.id}: ${result.reason}`,
		);
	}

	cache.delete(trigger.id);
	cache.set(trigger.id, { source: trigger.trigger, pattern });
	if (cache.size > MAX_CACHE_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	return pattern;
}

/** False for stored regex triggers that cannot run (unsupported syntax or over-length); they never match. */
export function isRegexTriggerUsable(trigger: RegexTrigger): boolean {
	return getPattern(trigger) !== null;
}

/** Named captures when the trigger matches the message, otherwise null. Unusable triggers never match. */
export function matchRegexTrigger(trigger: RegexTrigger, content: string): Record<string, string> | null {
	const pattern = getPattern(trigger);
	if (!pattern) return null;

	const matcher = pattern.matcher(content.slice(0, MAX_REGEX_INPUT_LENGTH));
	if (!matcher.find()) return null;

	const captured: Record<string, string> = {};
	for (const [name, value] of Object.entries(matcher.getNamedGroups())) {
		if (value !== null) captured[name] = value;
	}
	return captured;
}

export const regexTriggerTestHooks = {
	maxCacheEntries: MAX_CACHE_ENTRIES,
	cacheSize: () => cache.size,
	clearCache: () => cache.clear(),
};
