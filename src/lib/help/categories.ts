import type { CategoryMeta } from "./types.js";

export const CATEGORIES: readonly CategoryMeta[] = [
	{ id: "utility", label: "Utility", emoji: "🔧", description: "General-purpose tools: info, avatars, AFK, reminders, summaries." },
	{ id: "moderation", label: "Moderation", emoji: "🛡️", description: "Mute, kick, ban, warn, purge, and case management." },
	{ id: "config", label: "Server Config", emoji: "⚙️", description: "Configure channels, roles, auto-mod, and anti-raid settings." },
	{ id: "roles", label: "Roles", emoji: "🏷️", description: "Reaction roles and role select menus." },
	{ id: "leveling", label: "Leveling", emoji: "📈", description: "XP ranks, leaderboards, and role rewards." },
	{ id: "rpg", label: "RPG & Economy", emoji: "⚔️", description: "Profile, jobs, crime, training, shop, pets, properties, quests." },
	{ id: "fun", label: "Fun", emoji: "🎲", description: "Memes, polls, 8-ball, coin flips, and avatar effects." },
	{ id: "music", label: "Music", emoji: "🎵", description: "Play, queue, and control music in voice channels." },
	{ id: "giveaway", label: "Giveaways", emoji: "🎉", description: "Start, end, and reroll giveaways." },
	{ id: "suggestions", label: "Suggestions", emoji: "💡", description: "Submit and manage community suggestions." },
	{ id: "tickets", label: "Tickets", emoji: "🎫", description: "Open, claim, and manage support tickets." },
	{ id: "autorespond", label: "Autoresponders", emoji: "🤖", description: "Configure automatic message responses (static or LLM-generated)." },
] as const;

export function getCategory(id: string): CategoryMeta | undefined {
	return CATEGORIES.find((c) => c.id === id);
}
