export interface SubcommandMeta {
	summary: string;
	examples: string[];
}

export interface Command {
	name: string;
	description: string;
	examples: string[];
	category: string;
	usageNotes?: string;
	subcommands?: Record<string, SubcommandMeta>;
}

export interface Category {
	id: string;
	label: string;
	icon: string;
	description: string;
}

export interface CommandDoc extends Command {
	slug: string;
	syntax: string;
}

export const CATEGORIES: Category[] = [
	{
		id: "rpg",
		label: "RPG & Economy",
		icon: "⚔",
		description: "Profiles, jobs, crime, training, shop, pets, properties, daily rewards, and quests.",
	},
	{
		id: "moderation",
		label: "Moderation",
		icon: "⛨",
		description: "Mute, kick, ban, warn, purge, and case management.",
	},
	{ id: "music", label: "Music", icon: "♪", description: "Play, queue, and control music in voice channels." },
	{
		id: "utility",
		label: "Utility",
		icon: "◇",
		description: "Info, avatars, AFK, reminders, summaries, help, and personality tools.",
	},
	{ id: "fun", label: "Fun", icon: "✦", description: "Memes, polls, 8-ball, coin flips, and random choices." },
	{ id: "games", label: "Games", icon: "▣", description: "Interactive channel games backed by server history." },
	{ id: "leveling", label: "Leveling", icon: "★", description: "XP ranks, leaderboards, and role rewards." },
	{ id: "tickets", label: "Tickets", icon: "✉", description: "Open, claim, and manage support tickets." },
	{ id: "roles", label: "Roles", icon: "◈", description: "Reaction roles and role select menus." },
	{ id: "giveaway", label: "Giveaways", icon: "☆", description: "Start, end, and reroll giveaways." },
	{ id: "suggestions", label: "Suggestions", icon: "✎", description: "Submit and manage community suggestions." },
	{
		id: "config",
		label: "Server Config",
		icon: "⚙",
		description: "Configure channels, roles, auto-mod, and anti-raid settings.",
	},
	{
		id: "autorespond",
		label: "Autoresponders",
		icon: "⇄",
		description: "Static and LLM-backed automatic message responses.",
	},
	{ id: "minecraft", label: "Minecraft", icon: "▥", description: "Minecraft server status, live map, and mods." },
];

export const RAW_COMMANDS: Command[] = [
	{
		name: "/profile",
		description: "View your RPG profile or another player's stats and progress.",
		examples: ["/profile", "/profile user:@someone"],
		category: "rpg",
	},
	{
		name: "/train",
		description: "Train a stat to improve your RPG performance (4-hour cooldown, costs coins).",
		examples: ["/train stat:strength", "/train stat:intelligence"],
		category: "rpg",
	},
	{
		name: "/work",
		description: "Do a legal job to earn coins and XP on a cooldown.",
		examples: ["/work job:miner", "/work job:hacker"],
		category: "rpg",
	},
	{
		name: "/crime",
		description: "Attempt a crime job for coins and XP — risk jail if you fail.",
		examples: ["/crime job:pickpocket", "/crime job:heist"],
		category: "rpg",
	},
	{
		name: "/shop",
		description: "Browse, buy, and sell items in the RPG shop.",
		examples: ["/shop browse", "/shop buy item:lucky_charm", "/shop sell item:rare_gem"],
		category: "rpg",
	},
	{
		name: "/inventory",
		description: "View your item inventory and use or equip items.",
		examples: ["/inventory", "/inventory use:lucky_charm"],
		category: "rpg",
	},
	{
		name: "/pet",
		description: "Buy, view, and manage your pet companions.",
		examples: ["/pet view", "/pet buy pet:cat", "/pet rename name:Whiskers"],
		category: "rpg",
	},
	{
		name: "/property",
		description: "Buy properties that generate passive coin income over time.",
		examples: ["/property buy property:house", "/property collect", "/property list"],
		category: "rpg",
	},
	{
		name: "/daily",
		description: "Claim your daily RPG reward and maintain your streak.",
		examples: ["/daily"],
		category: "rpg",
	},
	{
		name: "/quests",
		description: "View today's daily quests and your completion progress.",
		examples: ["/quests"],
		category: "rpg",
	},
	{
		name: "/ban",
		description: "Ban a member from the server, optionally as a temporary ban.",
		examples: ["/ban user:@spammer reason:raid", "/ban user:@x duration:7d"],
		category: "moderation",
	},
	{
		name: "/kick",
		description: "Kick a member from the server.",
		examples: ["/kick user:@someone reason:inappropriate behavior"],
		category: "moderation",
	},
	{
		name: "/mute",
		description: "Mute a member for a duration.",
		examples: ["/mute user:@x duration:10m reason:spam", "/mute user:@y duration:1h"],
		category: "moderation",
	},
	{
		name: "/unmute",
		description: "Unmute a previously muted member.",
		examples: ["/unmute user:@x reason:served time"],
		category: "moderation",
	},
	{
		name: "/warn",
		description: "Warn a member and log the case.",
		examples: ["/warn user:@x reason:no caps in #general"],
		category: "moderation",
	},
	{
		name: "/unban",
		description: "Unban a user by their user ID.",
		examples: ["/unban user-id:123456789012345678 reason:appeal accepted"],
		category: "moderation",
	},
	{
		name: "/purge",
		description: "Bulk-delete messages from a channel (optionally filtered by user).",
		examples: ["/purge amount:50", "/purge amount:20 user:@spammer"],
		category: "moderation",
	},
	{
		name: "/case",
		description: "View or edit a moderation case.",
		examples: ["/case view number:12", "/case edit number:12 reason:updated context"],
		category: "moderation",
		subcommands: {
			view: { summary: "View a specific case by its number.", examples: ["/case view number:5"] },
			edit: { summary: "Edit the reason for an existing case.", examples: ["/case edit number:5 reason:typo fix"] },
		},
	},
	{
		name: "/history",
		description: "View moderation history for a user.",
		examples: ["/history user:@someone"],
		category: "moderation",
	},
	{
		name: "/play",
		description: "Play a song or playlist from a URL or search query.",
		examples: ["/play query:never gonna give you up", "/play query:https://youtu.be/dQw4w9WgXcQ"],
		category: "music",
	},
	{
		name: "/controls",
		description: "Pause, resume, skip, stop, or disconnect the music player.",
		examples: ["/controls"],
		category: "music",
	},
	{
		name: "/queue",
		description: "View the current music queue.",
		examples: ["/queue", "/queue page:2"],
		category: "music",
	},
	{
		name: "/nowplaying",
		description: "Show the currently playing song with progress bar.",
		examples: ["/nowplaying"],
		category: "music",
	},
	{
		name: "/volume",
		description: "Set the playback volume (1–200).",
		examples: ["/volume level:80"],
		category: "music",
	},
	{ name: "/shuffle", description: "Shuffle the current music queue.", examples: ["/shuffle"], category: "music" },
	{
		name: "/loop",
		description: "Set the queue loop mode (off, track, or queue).",
		examples: ["/loop mode:track", "/loop mode:queue", "/loop mode:off"],
		category: "music",
	},
	{ name: "/ping", description: "Check bot latency and API response time.", examples: ["/ping"], category: "utility" },
	{
		name: "/serverinfo",
		description: "Display information about this server.",
		examples: ["/serverinfo"],
		category: "utility",
	},
	{
		name: "/userinfo",
		description: "Display information about a user (account age, join date, roles).",
		examples: ["/userinfo", "/userinfo user:@someone"],
		category: "utility",
	},
	{
		name: "/avatar",
		description: "Show a user's avatar at full resolution.",
		examples: ["/avatar", "/avatar user:@someone"],
		category: "utility",
	},
	{
		name: "/snipe",
		description: "Show the last deleted message in this channel.",
		examples: ["/snipe"],
		category: "utility",
	},
	{
		name: "/editsnipe",
		description: "Show the last edited message in this channel (before the edit).",
		examples: ["/editsnipe"],
		category: "utility",
	},
	{
		name: "/afk",
		description: "Manage your AFK status — set a message or clear it.",
		examples: ["/afk set reason:brb lunch", "/afk clear"],
		category: "utility",
	},
	{
		name: "/remind",
		description: "Set, list, and cancel personal reminders.",
		examples: ["/remind set time:2h message:stretch", "/remind list", "/remind cancel id:3"],
		category: "utility",
	},
	{
		name: "/summarize",
		description: "Summarize recent messages in this channel using AI.",
		examples: ["/summarize", "/summarize count:100", "/summarize time:2h"],
		category: "utility",
		usageNotes: "Uses the local Ollama model. time overrides count if both are given.",
	},
	{
		name: "/personality",
		description: "View the bot's personality profile for a user or guild.",
		examples: ["/personality", "/personality user:@someone"],
		category: "utility",
	},
	{
		name: "/help",
		description: "Show the interactive command help menu.",
		examples: ["/help", "/help category:rpg"],
		category: "utility",
	},
	{
		name: "/8ball",
		description: "Ask the magic 8-ball a yes/no question.",
		examples: ["/8ball question:Will I win today?"],
		category: "fun",
	},
	{ name: "/coinflip", description: "Flip a coin — heads or tails.", examples: ["/coinflip"], category: "fun" },
	{
		name: "/choose",
		description: "Have the bot randomly pick from a list of choices.",
		examples: ["/choose options:pizza,sushi,tacos"],
		category: "fun",
	},
	{ name: "/meme", description: "Fetch a random meme from Reddit.", examples: ["/meme"], category: "fun" },
	{
		name: "/poll",
		description: "Create a button-based poll with up to 4 options.",
		examples: ["/poll question:Best language? options:Python,JS,Go,Rust"],
		category: "fun",
	},
	{
		name: "/guess_who",
		description: "Start a Guess Who round from archived messages in the configured channel.",
		examples: ["/guess_who"],
		category: "games",
		usageNotes: "Only works in GUESS_WHO_CHANNEL_ID. Three wrong guesses or a 10-minute timeout reveals the author.",
	},
	{
		name: "/rank",
		description: "View your XP rank or another member's.",
		examples: ["/rank", "/rank user:@someone"],
		category: "leveling",
	},
	{
		name: "/leaderboard",
		description: "View the top XP earners in this server.",
		examples: ["/leaderboard", "/leaderboard page:2"],
		category: "leveling",
	},
	{
		name: "/rewards",
		description: "View and manage role rewards granted at specific XP levels.",
		examples: ["/rewards list", "/rewards add level:10 role:@Veteran"],
		category: "leveling",
	},
	{
		name: "/level-reset",
		description: "Reset a user's XP and level back to zero.",
		examples: ["/level-reset user:@someone"],
		category: "leveling",
	},
	{
		name: "/ticket-panel",
		description: "Post a ticket creation panel button in a channel.",
		examples: ["/ticket-panel channel:#support title:Open a Ticket"],
		category: "tickets",
	},
	{
		name: "/ticket",
		description: "Open, close, claim, or manage support tickets.",
		examples: ["/ticket open topic:billing issue", "/ticket close", "/ticket claim", "/ticket add user:@helper"],
		category: "tickets",
	},
	{
		name: "/reaction-roles",
		description: "Add or remove reaction roles on messages.",
		examples: [
			"/reaction-roles add message-id:123456 emoji:👍 role:@Member",
			"/reaction-roles remove message-id:123456 emoji:👍",
		],
		category: "roles",
	},
	{
		name: "/role-menu",
		description: "Create and manage self-assignable role select menus.",
		examples: ["/role-menu create channel:#roles", "/role-menu add-option id:abc role:@Gamer label:Gamer"],
		category: "roles",
	},
	{
		name: "/giveaway",
		description: "Start, end, or reroll a giveaway.",
		examples: [
			"/giveaway start duration:1h prize:Nitro winners:2",
			"/giveaway end message-id:123456",
			"/giveaway reroll message-id:123456",
		],
		category: "giveaway",
	},
	{
		name: "/suggest",
		description: "Submit a suggestion to the server's suggestions channel.",
		examples: ["/suggest idea:Add a movie night bot"],
		category: "suggestions",
	},
	{
		name: "/suggestion",
		description: "Approve or deny a submitted suggestion.",
		examples: ["/suggestion approve id:5 response:Love this idea!", "/suggestion deny id:3 response:Out of scope"],
		category: "suggestions",
	},
	{
		name: "/config",
		description: "Configure server channels, roles, auto-moderation, and anti-raid settings.",
		examples: [
			"/config view",
			"/config set setting:log-channel channel:#mod-log",
			"/config automod setting:spam-threshold number:5",
		],
		category: "config",
	},
	{
		name: "/autorespond",
		description: "Add, remove, and list automatic keyword response triggers.",
		examples: [
			"/autorespond add trigger:hello response:Hi there!",
			"/autorespond list",
			"/autorespond remove trigger:hello",
		],
		category: "autorespond",
	},
	{
		name: "/minecraft",
		description: "Show the status of mc.bhayanak.net, the live map, Homestead version, and recommended mods.",
		examples: ["/minecraft"],
		category: "minecraft",
	},
];

export const slugForCommand = (name: string) =>
	name
		.replace(/^\//, "")
		.replaceAll("_", "-")
		.replace(/[^a-z0-9-]/gi, "-")
		.toLowerCase();

export const syntaxForCommand = (command: Command) =>
	command.examples[0]?.replace(/\s+[^\s]+:/g, " <arg>") ?? command.name;

export const COMMANDS: CommandDoc[] = RAW_COMMANDS.map((command) => ({
	...command,
	slug: slugForCommand(command.name),
	syntax: syntaxForCommand(command),
}));

export const COMMANDS_BY_CATEGORY = CATEGORIES.map((category) => ({
	...category,
	items: COMMANDS.filter((command) => command.category === category.id),
}));

export const TOTAL_COMMANDS = COMMANDS.length;
export const TOTAL_CATEGORIES = CATEGORIES.length;

export const findCommand = (slug: string) => COMMANDS.find((command) => command.slug === slug);
export const findCategory = (id: string) => CATEGORIES.find((category) => category.id === id);
