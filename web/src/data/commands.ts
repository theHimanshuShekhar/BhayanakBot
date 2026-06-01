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
		examples: ["/shop browse", "/shop buy item:lucky_charm", "/shop sell item:rare_gem quantity:1"],
		category: "rpg",
		subcommands: {
			browse: { summary: "Browse available shop items.", examples: ["/shop browse"] },
			buy: { summary: "Buy an item from the shop.", examples: ["/shop buy item:lucky_charm"] },
			sell: { summary: "Sell an item from your inventory.", examples: ["/shop sell item:rare_gem quantity:1"] },
		},
	},
	{
		name: "/inventory",
		description: "View your item inventory and use or equip items.",
		examples: ["/inventory view", "/inventory use item:lucky_charm", "/inventory equip item:pickaxe"],
		category: "rpg",
		subcommands: {
			view: { summary: "View your inventory.", examples: ["/inventory view"] },
			use: { summary: "Use a consumable item.", examples: ["/inventory use item:lucky_charm"] },
			equip: { summary: "Equip a tool item.", examples: ["/inventory equip item:pickaxe"] },
		},
	},
	{
		name: "/pet",
		description: "View, adopt, and rename your pet companions.",
		examples: ["/pet view", "/pet adopt pet:cat", "/pet rename pet:cat name:Whiskers"],
		category: "rpg",
		subcommands: {
			view: { summary: "View your pets.", examples: ["/pet view"] },
			adopt: { summary: "Adopt a pet from the market.", examples: ["/pet adopt pet:cat"] },
			rename: { summary: "Give a pet a nickname.", examples: ["/pet rename pet:cat name:Whiskers"] },
		},
	},
	{
		name: "/property",
		description: "Buy and manage properties for passive income or storage bonuses.",
		examples: ["/property buy property:studio_apartment", "/property collect", "/property view"],
		category: "rpg",
		subcommands: {
			view: { summary: "View your properties.", examples: ["/property view"] },
			buy: { summary: "Purchase a property.", examples: ["/property buy property:studio_apartment"] },
			collect: { summary: "Collect accumulated property income.", examples: ["/property collect"] },
		},
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
		usageNotes: "Requires a configured muted role via /config set muted-role.",
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
		usageNotes:
			"Only messages from the latest amount fetched are considered; if user is provided, that subset is filtered by author. Messages older than 14 days cannot be bulk-deleted.",
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
		usageNotes: "Shows up to the first 20 moderation cases for the selected user.",
	},
	{
		name: "/play",
		description: "Play a song or playlist from a URL or search query.",
		examples: ["/play query:never gonna give you up", "/play query:https://youtu.be/dQw4w9WgXcQ"],
		category: "music",
	},
	{
		name: "/music",
		description: "Pause, resume, skip, stop, or disconnect the music player.",
		examples: ["/music pause", "/music resume", "/music skip", "/music stop", "/music disconnect"],
		category: "music",
		subcommands: {
			pause: { summary: "Pause the current track.", examples: ["/music pause"] },
			resume: { summary: "Resume paused playback.", examples: ["/music resume"] },
			skip: { summary: "Skip the current track.", examples: ["/music skip"] },
			stop: { summary: "Stop playback and clear the queue.", examples: ["/music stop"] },
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
		description: "Set the playback volume (0–100).",
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
		description: "Show a user's server avatar, or global avatar if no server avatar is set.",
		examples: ["/avatar", "/avatar user:@someone"],
		category: "utility",
	},
	{
		name: "/snipe",
		description: "Privately show moderators the last deleted message cached for this channel.",
		examples: ["/snipe"],
		category: "utility",
		usageNotes: "Moderator-only. The response is ephemeral and only shows cached content for the current channel.",
	},
	{
		name: "/editsnipe",
		description: "Privately show moderators the last edited message cached for this channel.",
		examples: ["/editsnipe"],
		category: "utility",
		usageNotes: "Moderator-only. The response is ephemeral and only shows cached before/after content for the current channel.",
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
			set: {
				summary: "Set a reminder after a duration such as 10m, 2h, or 1d.",
				examples: ['/remind set time:30m message:"check oven"'],
			},
			list: { summary: "List your active reminders.", examples: ["/remind list"] },
			cancel: { summary: "Cancel a reminder by its ID.", examples: ["/remind cancel id:7"] },
		},
	},
	{
		name: "/summarize",
		description: "Summarize recent messages in this channel using AI.",
		examples: ["/summarize", "/summarize count:100", "/summarize time:2h"],
		category: "utility",
		usageNotes:
			"Uses the configured AI provider. time choices are 15m, 30m, 1h, 2h, 6h, and 24h; time overrides count. Summarizes up to 200 non-bot text messages and successful summaries apply a 10-minute channel cooldown.",
	},
	{
		name: "/personality",
		description: "View user personality profiles or this server culture profile, and run archive-backed refreshes.",
		examples: [
			"/personality view user user:@someone",
			"/personality view guild",
			"/personality refresh user user:@someone",
			"/personality refresh guild",
		],
		category: "utility",
		usageNotes:
			"Refresh runs an incremental update from eligible archived training evidence and reports if it is skipped. Server administrators can disable personality features with /config.",
		subcommands: {
			"view user": {
				summary: "View your own user personality profile or another member's profile.",
				examples: ["/personality view user", "/personality view user user:@someone"],
			},
			"view guild": { summary: "View this server's culture profile.", examples: ["/personality view guild"] },
			"refresh user": {
				summary: "Refresh a user's personality profile from new archive evidence.",
				examples: ["/personality refresh user user:@someone"],
			},
			"refresh guild": {
				summary: "Refresh this server's culture profile from new archive evidence.",
				examples: ["/personality refresh guild"],
			},
		},
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
		description: "Create a button-based poll with 2–4 options and an optional duration.",
		examples: [
			'/poll question:"Best language?" option1:Python option2:JS option3:Go option4:Rust',
			'/poll question:"Raid time?" option1:Now option2:Later duration:30',
		],
		category: "fun",
	},
	{
		name: "/guess_who",
		description: "Start a Guess Who round from archived messages in the configured channel.",
		examples: ["/guess_who"],
		category: "games",
		usageNotes:
			"Only works in GUESS_WHO_CHANNEL_ID. Guess by mentioning a user. One active round is allowed per channel; three wrong guesses or a 10-minute timeout reveals the author.",
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
		description: "View and manage role rewards granted at specific levels.",
		examples: ["/rewards list", "/rewards add level:10 role:@Veteran", "/rewards remove level:10"],
		category: "leveling",
		subcommands: {
			list: { summary: "List all configured level rewards.", examples: ["/rewards list"] },
			add: {
				summary: "Add a role reward for reaching a level. Requires Administrator permission.",
				examples: ["/rewards add level:10 role:@Veteran"],
			},
			remove: {
				summary: "Remove a level reward. Requires Administrator permission.",
				examples: ["/rewards remove level:10"],
			},
		},
	},
	{
		name: "/level-reset",
		description: "Reset a user's XP, level, message count, and last message timestamp.",
		examples: ["/level-reset user:@someone"],
		category: "leveling",
		usageNotes: "Requires admin permissions.",
	},
	{
		name: "/ticket-panel",
		description: "Post a ticket creation panel button in a channel.",
		examples: ["/ticket-panel channel:#support title:Open a Ticket"],
		category: "tickets",
	},
	{
		name: "/ticket",
		description: "Open, close, claim, add or remove users from, or export support tickets.",
		examples: [
			"/ticket open subject:billing issue",
			"/ticket close",
			"/ticket claim",
			"/ticket add user:@helper",
			"/ticket transcript",
		],
		category: "tickets",
		subcommands: {
			open: { summary: "Open a support ticket.", examples: ["/ticket open subject:billing issue"] },
			close: { summary: "Close the current ticket.", examples: ["/ticket close"] },
			claim: { summary: "Claim the current ticket as staff.", examples: ["/ticket claim"] },
			add: { summary: "Add a user to the current ticket.", examples: ["/ticket add user:@helper"] },
			remove: { summary: "Remove a user from the current ticket.", examples: ["/ticket remove user:@helper"] },
			transcript: { summary: "Export a ticket transcript.", examples: ["/ticket transcript"] },
		},
	},
	{
		name: "/reactionrole",
		description: "Add or remove reaction roles on messages.",
		examples: [
			"/reactionrole add message-id:123456 emoji:👍 role:@Member",
			"/reactionrole add message-id:123456 emoji:👍 role:@Member type:toggle",
			"/reactionrole remove message-id:123456 emoji:👍",
		],
		category: "roles",
		usageNotes: "type can be normal, toggle, or unique.",
		subcommands: {
			add: {
				summary: "Attach a reaction role to a message.",
				examples: ["/reactionrole add message-id:123456 emoji:👍 role:@Member"],
			},
			remove: {
				summary: "Remove a reaction role from a message.",
				examples: ["/reactionrole remove message-id:123456 emoji:👍"],
			},
		},
	},
	{
		name: "/rolemenu",
		description: "Create and manage self-assignable role select menus.",
		examples: [
			"/rolemenu create channel:#roles",
			"/rolemenu create channel:#roles placeholder:Pick roles max-values:2",
			"/rolemenu add-option message-id:123456 role:@Gamer label:Gamer",
			"/rolemenu delete message-id:123456",
		],
		category: "roles",
		subcommands: {
			create: { summary: "Create a role selection menu in a channel.", examples: ["/rolemenu create channel:#roles"] },
			"add-option": {
				summary: "Add a role option to an existing menu.",
				examples: ["/rolemenu add-option message-id:123456 role:@Gamer label:Gamer"],
			},
			delete: { summary: "Delete an existing role menu.", examples: ["/rolemenu delete message-id:123456"] },
		},
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
		subcommands: {
			start: {
				summary: "Start a timed giveaway in the current channel.",
				examples: ["/giveaway start duration:1h prize:Nitro winners:2"],
			},
			end: { summary: "End a giveaway early and draw winners.", examples: ["/giveaway end message-id:123456"] },
			reroll: { summary: "Reroll winners for an ended giveaway.", examples: ["/giveaway reroll message-id:123456"] },
		},
	},
	{
		name: "/suggest",
		description: "Submit a suggestion to the configured suggestions/log channel.",
		examples: ["/suggest idea:Add a movie night bot"],
		category: "suggestions",
	},
	{
		name: "/suggestion",
		description: "Approve or deny a submitted suggestion.",
		examples: ["/suggestion approve id:5 response:Love this idea!", "/suggestion deny id:3 reason:Out of scope"],
		category: "suggestions",
		subcommands: {
			approve: {
				summary: "Approve a suggestion with an optional response.",
				examples: ["/suggestion approve id:5 response:Love this idea!"],
			},
			deny: {
				summary: "Deny a suggestion with an optional reason.",
				examples: ["/suggestion deny id:3 reason:Out of scope"],
			},
		},
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
		subcommands: {
			view: { summary: "View current server configuration.", examples: ["/config view"] },
			set: {
				summary: "Set a channel, role, XP, message, personality, or random response setting.",
				examples: ["/config set setting:log-channel channel:#mod-log"],
			},
			automod: {
				summary: "Configure auto-moderation thresholds and actions.",
				examples: ["/config automod setting:spam-threshold number:5"],
			},
			antiraid: {
				summary: "Configure anti-raid join-rate protection.",
				examples: ["/config antiraid setting:threshold number:10"],
			},
		},
	},
	{
		name: "/autorespond",
		description: "Add, remove, and list static or LLM auto-responses with keyword or regex triggers.",
		examples: [
			"/autorespond add trigger:hello response:Hi there!",
			"/autorespond add trigger:^my name is (?<name>.+)$ response:Nice to meet you, {name}! use-regex:true",
			"/autorespond add trigger:bug response:Please file a bug report! require-mention:true",
			"/autorespond list",
			"/autorespond remove trigger:hello",
		],
		category: "autorespond",
		subcommands: {
			add: {
				summary: "Add a static or LLM-backed auto-response trigger.",
				examples: [
					'/autorespond add trigger:"hello" response:"Hi there!"',
					'/autorespond add trigger:"bug" response:"Please file a bug report!" require-mention:true',
				],
			},
			remove: { summary: "Remove an auto-response by trigger.", examples: ["/autorespond remove trigger:hello"] },
			list: { summary: "List all configured auto-responses.", examples: ["/autorespond list"] },
		},
	},
	{
		name: "/minecraft",
		description:
			"Show mc.bhayanak.net status, online players, live map, required Homestead modpack version, and recommended mods.",
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
