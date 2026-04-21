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

export const CATEGORIES: Category[] = [
	{ id: "all", label: "All", icon: "⚡", description: "All 56 commands" },
	{ id: "rpg", label: "RPG & Economy", icon: "⚔️", description: "Profile, jobs, crime, training, shop, pets, properties, quests." },
	{ id: "moderation", label: "Moderation", icon: "🛡️", description: "Mute, kick, ban, warn, purge, and case management." },
	{ id: "music", label: "Music", icon: "🎵", description: "Play, queue, and control music in voice channels." },
	{ id: "utility", label: "Utility", icon: "🔧", description: "General-purpose tools: info, avatars, AFK, reminders, summaries." },
	{ id: "fun", label: "Fun", icon: "🎲", description: "Memes, polls, 8-ball, coin flips, and avatar effects." },
	{ id: "leveling", label: "Leveling", icon: "📈", description: "XP ranks, leaderboards, and role rewards." },
	{ id: "tickets", label: "Tickets", icon: "🎫", description: "Open, claim, and manage support tickets." },
	{ id: "roles", label: "Roles", icon: "🏷️", description: "Reaction roles and role select menus." },
	{ id: "giveaway", label: "Giveaways", icon: "🎉", description: "Start, end, and reroll giveaways." },
	{ id: "suggestions", label: "Suggestions", icon: "💡", description: "Submit and manage community suggestions." },
	{ id: "config", label: "Server Config", icon: "⚙️", description: "Configure channels, roles, auto-mod, and anti-raid settings." },
	{ id: "autorespond", label: "Autoresponders", icon: "🤖", description: "Configure automatic message responses (static or LLM-generated)." },
];

export const COMMANDS: Command[] = [
	// RPG (10)
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
		name: "/quests",
		description: "View today's daily quests and your completion progress.",
		examples: ["/quests"],
		category: "rpg",
	},
	{
		name: "/portrait",
		description: "Generate an AI character portrait based on your RPG stats (7-day cooldown).",
		examples: ["/portrait"],
		category: "rpg",
	},
	// Moderation (9)
	{
		name: "/ban",
		description: "Ban a member from the server, optionally as a temporary ban.",
		examples: ['/ban user:@spammer reason:"raid"', "/ban user:@x duration:7d"],
		category: "moderation",
	},
	{
		name: "/kick",
		description: "Kick a member from the server.",
		examples: ['/kick user:@someone reason:"inappropriate behavior"'],
		category: "moderation",
	},
	{
		name: "/mute",
		description: "Mute a member for a duration.",
		examples: ['/mute user:@x duration:10m reason:"spam"', "/mute user:@y duration:1h"],
		category: "moderation",
	},
	{
		name: "/unmute",
		description: "Unmute a previously muted member.",
		examples: ['/unmute user:@x reason:"served time"'],
		category: "moderation",
	},
	{
		name: "/warn",
		description: "Warn a member and log the case.",
		examples: ['/warn user:@x reason:"no caps in #general"'],
		category: "moderation",
	},
	{
		name: "/unban",
		description: "Unban a user by their user ID.",
		examples: ['/unban user-id:123456789012345678 reason:"appeal accepted"'],
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
		examples: ["/case view number:12", '/case edit number:12 reason:"updated context"'],
		category: "moderation",
		subcommands: {
			view: { summary: "View a specific case by its number.", examples: ["/case view number:5"] },
			edit: { summary: "Edit the reason for an existing case.", examples: ['/case edit number:5 reason:"typo fix"'] },
		},
	},
	{
		name: "/history",
		description: "View moderation history for a user.",
		examples: ["/history user:@someone"],
		category: "moderation",
	},
	// Music (7)
	{
		name: "/play",
		description: "Play a song or playlist from a URL or search query.",
		examples: ["/play query:never gonna give you up", "/play query:https://youtu.be/dQw4w9WgXcQ"],
		category: "music",
	},
	{
		name: "/music",
		description: "Pause, resume, skip, stop, or disconnect the music player.",
		examples: ["/music pause", "/music skip", "/music stop", "/music disconnect"],
		category: "music",
		subcommands: {
			pause: { summary: "Pause the current song.", examples: ["/music pause"] },
			resume: { summary: "Resume playback.", examples: ["/music resume"] },
			skip: { summary: "Skip the current song.", examples: ["/music skip"] },
			stop: { summary: "Stop music and clear the queue.", examples: ["/music stop"] },
			disconnect: { summary: "Disconnect the bot from voice.", examples: ["/music disconnect"] },
		},
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
	{
		name: "/shuffle",
		description: "Shuffle the current music queue.",
		examples: ["/shuffle"],
		category: "music",
	},
	{
		name: "/loop",
		description: "Set the queue loop mode (off, track, or queue).",
		examples: ["/loop mode:track", "/loop mode:queue", "/loop mode:off"],
		category: "music",
	},
	// Utility (11)
	{
		name: "/ping",
		description: "Check bot latency and API response time.",
		examples: ["/ping"],
		category: "utility",
	},
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
		subcommands: {
			set: { summary: "Set yourself as AFK with an optional reason.", examples: ["/afk set reason:studying"] },
			clear: { summary: "Clear your AFK status manually.", examples: ["/afk clear"] },
		},
	},
	{
		name: "/remind",
		description: "Set, list, and cancel personal reminders.",
		examples: ['/remind set time:2h message:"stretch"', "/remind list", "/remind cancel id:3"],
		category: "utility",
		subcommands: {
			set: { summary: "Set a reminder after a duration (e.g. 10m, 2h, 1d).", examples: ['/remind set time:30m message:"check oven"'] },
			list: { summary: "List your active reminders.", examples: ["/remind list"] },
			cancel: { summary: "Cancel a reminder by its ID.", examples: ["/remind cancel id:7"] },
		},
	},
	{
		name: "/summarize",
		description: "Summarize recent messages in this channel using AI.",
		examples: ["/summarize", "/summarize count:100", "/summarize time:2h"],
		category: "utility",
		usageNotes: "Uses the local Ollama model. `time` overrides `count` if both are given.",
	},
	{
		name: "/personality",
		description: "View the bot's personality profile for a user (admin only).",
		examples: ["/personality", "/personality user:@someone"],
		category: "utility",
	},
	{
		name: "/help",
		description: "Show the interactive command help menu.",
		examples: ["/help", "/help category:rpg"],
		category: "utility",
	},
	// Fun (6)
	{
		name: "/8ball",
		description: "Ask the magic 8-ball a yes/no question.",
		examples: ["/8ball question:Will I win today?"],
		category: "fun",
	},
	{
		name: "/coinflip",
		description: "Flip a coin — heads or tails.",
		examples: ["/coinflip"],
		category: "fun",
	},
	{
		name: "/choose",
		description: "Have the bot randomly pick from a list of choices.",
		examples: ["/choose options:pizza,sushi,tacos"],
		category: "fun",
	},
	{
		name: "/meme",
		description: "Fetch a random meme from Reddit.",
		examples: ["/meme"],
		category: "fun",
	},
	{
		name: "/poll",
		description: "Create a button-based poll with up to 4 options.",
		examples: ['/poll question:"Best language?" options:"Python,JS,Go,Rust"'],
		category: "fun",
	},
	{
		name: "/pfp-edit",
		description: "Add a fun frame or effect to your profile picture.",
		examples: ["/pfp-edit effect:rainbow"],
		category: "fun",
	},
	// Leveling (4)
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
		subcommands: {
			list: { summary: "List all configured level rewards.", examples: ["/rewards list"] },
			add: { summary: "Add a role reward for reaching a level.", examples: ["/rewards add level:10 role:@Veteran"] },
			remove: { summary: "Remove a level reward.", examples: ["/rewards remove level:10"] },
		},
	},
	{
		name: "/level-reset",
		description: "Reset a user's XP and level back to zero.",
		examples: ["/level-reset user:@someone"],
		category: "leveling",
	},
	// Tickets (2)
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
		subcommands: {
			open: { summary: "Open a new support ticket.", examples: ["/ticket open topic:billing issue"] },
			close: { summary: "Close the current ticket channel.", examples: ["/ticket close"] },
			claim: { summary: "Claim the ticket as your own to handle.", examples: ["/ticket claim"] },
			add: { summary: "Add a user to the ticket channel.", examples: ["/ticket add user:@helper"] },
			remove: { summary: "Remove a user from the ticket channel.", examples: ["/ticket remove user:@helper"] },
			transcript: { summary: "Export a text transcript of the ticket.", examples: ["/ticket transcript"] },
		},
	},
	// Roles (2)
	{
		name: "/reactionrole",
		description: "Add or remove reaction roles on messages.",
		examples: ["/reactionrole add message-id:123456 emoji:👍 role:@Member", "/reactionrole remove message-id:123456 emoji:👍"],
		category: "roles",
		subcommands: {
			add: { summary: "Attach a reaction role to a message.", examples: ["/reactionrole add message-id:123456 emoji:👍 role:@Member"] },
			remove: { summary: "Remove a reaction role from a message.", examples: ["/reactionrole remove message-id:123456 emoji:👍"] },
		},
	},
	{
		name: "/rolemenu",
		description: "Create and manage self-assignable role select menus.",
		examples: ["/rolemenu create channel:#roles", "/rolemenu add-option id:abc role:@Gamer label:Gamer"],
		category: "roles",
		subcommands: {
			create: { summary: "Create a role selection menu in a channel.", examples: ["/rolemenu create channel:#roles"] },
			delete: { summary: "Delete an existing role menu.", examples: ["/rolemenu delete id:abc123"] },
			"add-option": { summary: "Add a role option to an existing menu.", examples: ["/rolemenu add-option id:abc123 role:@Gamer label:Gamer"] },
		},
	},
	// Giveaway (1)
	{
		name: "/giveaway",
		description: "Start, end, or reroll a giveaway.",
		examples: ["/giveaway start duration:1h prize:Nitro winners:2", "/giveaway end message-id:123456", "/giveaway reroll message-id:123456"],
		category: "giveaway",
		subcommands: {
			start: { summary: "Start a timed giveaway in the current channel.", examples: ["/giveaway start duration:1h prize:Nitro winners:2"] },
			end: { summary: "End a giveaway early and draw winners.", examples: ["/giveaway end message-id:123456"] },
			reroll: { summary: "Reroll winners for an ended giveaway.", examples: ["/giveaway reroll message-id:123456"] },
		},
	},
	// Suggestions (2)
	{
		name: "/suggest",
		description: "Submit a suggestion to the server's suggestions channel.",
		examples: ['/suggest idea:"Add a movie night bot"'],
		category: "suggestions",
	},
	{
		name: "/suggestion",
		description: "Approve or deny a submitted suggestion.",
		examples: ["/suggestion approve id:5 response:Love this idea!", "/suggestion deny id:3 response:Out of scope"],
		category: "suggestions",
		subcommands: {
			approve: { summary: "Approve a suggestion with an optional response.", examples: ["/suggestion approve id:5"] },
			deny: { summary: "Deny a suggestion with an optional response.", examples: ["/suggestion deny id:3 response:Out of scope"] },
		},
	},
	// Config (1)
	{
		name: "/config",
		description: "Configure server channels, roles, auto-moderation, and anti-raid settings.",
		examples: ["/config view", "/config set setting:log-channel channel:#mod-log", "/config automod setting:spam-threshold number:5"],
		category: "config",
		subcommands: {
			view: { summary: "View current server configuration.", examples: ["/config view"] },
			set: { summary: "Set a configuration value for a specific setting.", examples: ["/config set setting:log-channel channel:#mod-log"] },
			automod: { summary: "Configure auto-moderation thresholds.", examples: ["/config automod setting:spam-threshold number:5"] },
			antiraid: { summary: "Configure anti-raid protection (join rate limits).", examples: ["/config antiraid setting:threshold number:10"] },
		},
	},
	// Autorespond (1)
	{
		name: "/autorespond",
		description: "Add, remove, and list automatic keyword response triggers.",
		examples: ['/autorespond add trigger:"hello" response:"Hi there!"', "/autorespond list", "/autorespond remove trigger:hello"],
		category: "autorespond",
		subcommands: {
			add: { summary: "Add a new auto-response trigger.", examples: ['/autorespond add trigger:"hello" response:"Hi there!"'] },
			remove: { summary: "Remove an auto-response trigger.", examples: ["/autorespond remove trigger:hello"] },
			list: { summary: "List all configured auto-responses.", examples: ["/autorespond list"] },
		},
	},
];
