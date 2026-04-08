const NSFW_BLOCKLIST = [
	"nude",
	"naked",
	"nsfw",
	"porn",
	"sex",
	"explicit",
	"hentai",
	"breasts",
	"genitals",
	"penis",
	"vagina",
	"erotic",
	"xxx",
	"topless",
	"blowjob",
	"orgasm",
	"cumshot",
];

export function isNsfwPrompt(prompt: string): boolean {
	const lower = prompt.toLowerCase();
	return NSFW_BLOCKLIST.some((term) => lower.includes(term));
}
