export interface Command {
	name: string;
	description: string;
	usage: string;
	category: string;
}

export interface Category {
	id: string;
	label: string;
	icon: string;
	description: string;
}

export const CATEGORIES: Category[] = [
	{ id: "all", label: "All", icon: "⚡", description: "All 52 commands" },
	{ id: "rpg", label: "RPG", icon: "⚔️", description: "Economy, jobs, pets, and AI-narrated adventures" },
	{ id: "moderation", label: "Moderation", icon: "🛡️", description: "Ban, kick, mute, warn, and case management" },
	{ id: "music", label: "Music", icon: "🎵", description: "Full music player with queue management" },
	{ id: "utility", label: "Utility", icon: "🔧", description: "Server info, sniping, reminders, and more" },
	{ id: "fun", label: "Fun", icon: "🎮", description: "Games, polls, and random fun" },
	{ id: "leveling", label: "Leveling", icon: "📈", description: "XP progression and rank cards" },
	{ id: "tickets", label: "Tickets", icon: "🎫", description: "Support ticket system" },
	{ id: "roles", label: "Roles", icon: "🏷️", description: "Reaction roles and role menus" },
	{ id: "giveaways", label: "Giveaways", icon: "🎉", description: "Timed giveaway management" },
	{ id: "suggestions", label: "Suggestions", icon: "💡", description: "Server suggestion system" },
	{ id: "config", label: "Config", icon: "⚙️", description: "Per-guild bot configuration" },
	{ id: "autorespond", label: "Auto-respond", icon: "🤖", description: "Automatic response triggers" },
];

export const COMMANDS: Command[] = [
	// RPG (10)
	{ name: "/profile", description: "View your RPG profile including stats, coins, level, and equipped pet.", usage: "/profile [user]", category: "rpg" },
	{ name: "/train", description: "Train a stat (strength, agility, charisma) to improve job success rates.", usage: "/train <stat>", category: "rpg" },
	{ name: "/work", description: "Work a job to earn coins. Each job has different pay, cooldowns, and success chances.", usage: "/work", category: "rpg" },
	{ name: "/crime", description: "Attempt a crime for bigger rewards — risk getting jailed on failure.", usage: "/crime", category: "rpg" },
	{ name: "/shop", description: "Browse and buy items from the shop. Items grant bonuses to jobs and stats.", usage: "/shop [category]", category: "rpg" },
	{ name: "/inventory", description: "View your item inventory and manage consumables.", usage: "/inventory", category: "rpg" },
	{ name: "/pet", description: "Adopt, name, and manage your pet companion. Pets provide passive stat bonuses.", usage: "/pet <action>", category: "rpg" },
	{ name: "/property", description: "Buy and manage properties that generate passive income per hour.", usage: "/property <action>", category: "rpg" },
	{ name: "/quests", description: "View and track your active RPG quests.", usage: "/quests", category: "rpg" },
	{ name: "/portrait", description: "Generate an AI portrait of your RPG character using Stable Diffusion.", usage: "/portrait", category: "rpg" },
	// Moderation (9)
	{ name: "/ban", description: "Ban a member from the server with an optional reason and duration.", usage: "/ban <user> [reason] [duration]", category: "moderation" },
	{ name: "/kick", description: "Kick a member from the server.", usage: "/kick <user> [reason]", category: "moderation" },
	{ name: "/mute", description: "Timeout a member for a specified duration.", usage: "/mute <user> <duration> [reason]", category: "moderation" },
	{ name: "/unmute", description: "Remove a timeout from a member.", usage: "/unmute <user>", category: "moderation" },
	{ name: "/warn", description: "Issue a warning to a member and log it as a mod case.", usage: "/warn <user> <reason>", category: "moderation" },
	{ name: "/unban", description: "Unban a previously banned member by user ID.", usage: "/unban <userId>", category: "moderation" },
	{ name: "/purge", description: "Bulk delete messages in the current channel.", usage: "/purge <amount>", category: "moderation" },
	{ name: "/case", description: "View details of a specific moderation case by number.", usage: "/case <number>", category: "moderation" },
	{ name: "/history", description: "View a member's full moderation history.", usage: "/history <user>", category: "moderation" },
	// Music (7)
	{ name: "/play", description: "Play a song or playlist from YouTube, Spotify, or SoundCloud.", usage: "/play <query|url>", category: "music" },
	{ name: "/controls", description: "Show music player controls (pause, resume, skip, stop).", usage: "/controls", category: "music" },
	{ name: "/queue", description: "View the current music queue.", usage: "/queue", category: "music" },
	{ name: "/nowplaying", description: "Show info about the currently playing track.", usage: "/nowplaying", category: "music" },
	{ name: "/volume", description: "Set the playback volume (0–100).", usage: "/volume <level>", category: "music" },
	{ name: "/shuffle", description: "Shuffle the current queue.", usage: "/shuffle", category: "music" },
	{ name: "/loop", description: "Toggle looping for the current track or the entire queue.", usage: "/loop [mode]", category: "music" },
	// Utility (8)
	{ name: "/ping", description: "Check the bot latency and API response time.", usage: "/ping", category: "utility" },
	{ name: "/serverinfo", description: "Display information about the current server.", usage: "/serverinfo", category: "utility" },
	{ name: "/userinfo", description: "Display information about a user.", usage: "/userinfo [user]", category: "utility" },
	{ name: "/avatar", description: "Show a user's avatar in full size.", usage: "/avatar [user]", category: "utility" },
	{ name: "/snipe", description: "Show the most recently deleted message in the channel.", usage: "/snipe", category: "utility" },
	{ name: "/editsnipe", description: "Show the most recently edited message in the channel.", usage: "/editsnipe", category: "utility" },
	{ name: "/afk", description: "Set an AFK status. The bot will notify others when you are pinged.", usage: "/afk [reason]", category: "utility" },
	{ name: "/remind", description: "Set a reminder that the bot will DM you at the specified time.", usage: "/remind <time> <message>", category: "utility" },
	// Fun (5)
	{ name: "/8ball", description: "Ask the magic 8-ball a yes/no question.", usage: "/8ball <question>", category: "fun" },
	{ name: "/coinflip", description: "Flip a coin — heads or tails.", usage: "/coinflip", category: "fun" },
	{ name: "/choose", description: "Have the bot pick from a list of options.", usage: "/choose <option1> <option2> ...", category: "fun" },
	{ name: "/meme", description: "Fetch a random meme from Reddit.", usage: "/meme", category: "fun" },
	{ name: "/poll", description: "Create an interactive poll with up to 10 options.", usage: "/poll <question> <options...>", category: "fun" },
	// Leveling (4)
	{ name: "/rank", description: "View your XP rank card in the server.", usage: "/rank [user]", category: "leveling" },
	{ name: "/leaderboard", description: "View the top members by XP in the server.", usage: "/leaderboard", category: "leveling" },
	{ name: "/rewards", description: "View the XP level-up role rewards configured for this server.", usage: "/rewards", category: "leveling" },
	{ name: "/reset", description: "Reset a member's XP progress (admin only).", usage: "/reset <user>", category: "leveling" },
	// Tickets (2)
	{ name: "/ticket-panel", description: "Send a ticket creation panel to the current channel (admin only).", usage: "/ticket-panel", category: "tickets" },
	{ name: "/ticket", description: "Manage the current support ticket (close, add/remove members).", usage: "/ticket <action>", category: "tickets" },
	// Roles (2)
	{ name: "/reaction-roles", description: "Set up a reaction role message in a channel.", usage: "/reaction-roles", category: "roles" },
	{ name: "/role-menu", description: "Create a dropdown role-selection menu.", usage: "/role-menu", category: "roles" },
	// Giveaways (1)
	{ name: "/giveaway", description: "Create, end, or reroll a giveaway.", usage: "/giveaway <action>", category: "giveaways" },
	// Suggestions (2)
	{ name: "/suggest", description: "Submit a suggestion to the server suggestions channel.", usage: "/suggest <text>", category: "suggestions" },
	{ name: "/suggestion", description: "Approve, deny, or respond to a suggestion (mod only).", usage: "/suggestion <action> <id>", category: "suggestions" },
	// Config (1)
	{ name: "/config", description: "Configure per-guild bot settings (roles, channels, feature flags).", usage: "/config <setting> <value>", category: "config" },
	// Auto-respond (1)
	{ name: "/autorespond", description: "Create, list, or delete auto-response triggers for the server.", usage: "/autorespond <action>", category: "autorespond" },
];
