const UNIT_MS = {
	w: 7 * 24 * 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
	h: 60 * 60 * 1000,
	m: 60 * 1000,
	s: 1000,
} as const;

type Unit = keyof typeof UNIT_MS;

export interface DurationCap {
	ms: number;
	label: string;
}

const YEAR: DurationCap = { ms: 365 * 24 * 60 * 60 * 1000, label: "1 year" };
const THIRTY_DAYS: DurationCap = { ms: 30 * 24 * 60 * 60 * 1000, label: "30 days" };

/** Longest duration each command accepts. */
export const DURATION_CAPS = {
	mute: YEAR,
	tempban: YEAR,
	reminder: YEAR,
	giveaway: THIRTY_DAYS,
	poll: THIRTY_DAYS,
} as const;

export type DurationResult = { ok: true; ms: number } | { ok: false; error: string };

const FORMAT_HINT = "Use a number plus a unit (`s`, `m`, `h`, `d`, `w`), e.g. `10m`, `2h`, `1d`, `1h30m`.";
const WHOLE_PATTERN = /^(?:\d+[smhdw])+$/;
const PART_PATTERN = /(\d+)([smhdw])/g;

/**
 * Parses a strict duration such as `10m`, `2d` or `1h30m`.
 *
 * Units are `s`, `m` (minutes), `h`, `d` and `w`, case-insensitive, and may be chained. Bare numbers, signs,
 * decimals and zero are rejected, as is anything longer than `cap`.
 */
export function parseDuration(input: string, cap: DurationCap): DurationResult {
	const text = input.trim().toLowerCase();

	if (/^\d+$/.test(text)) return { ok: false, error: `Add a unit, e.g. \`10m\`. ${FORMAT_HINT}` };
	if (!WHOLE_PATTERN.test(text)) return { ok: false, error: `Invalid duration. ${FORMAT_HINT}` };

	let total = 0;
	for (const [, digits, unit] of text.matchAll(PART_PATTERN)) {
		// Huge digit strings become Infinity (or lose precision); either way the cap check below rejects them.
		total += Number(digits) * UNIT_MS[unit as Unit];
	}

	if (!(total <= cap.ms)) return { ok: false, error: `Duration is too long. Use at most ${cap.label}.` };
	if (total === 0) return { ok: false, error: "Duration must be greater than zero." };
	return { ok: true, ms: total };
}
