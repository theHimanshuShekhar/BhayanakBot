export const releases = [
	{
		version: "3.0.0",
		date: "October 2026",
		tag: "current",
		groups: [
			{
				heading: "Added",
				items: [
					"Random replies are on by default in #general at 3%, and only join in when the channel is busy and enough real chat has passed since the last one",
					"AI replies and `/summarize` name people by their current nickname, without pinging anyone",
					"Personality profiles are written on a schedule and stay a fixed size; administrators can force one with `/personality refresh`",
					"Live Minecraft player channels that show who is online",
					"A mod-log notice when AI replies go down, and another when they recover",
					"`/config reset` clears a setting or puts it back to its default",
				],
			},
			{
				heading: "Changed",
				items: [
					"`/summarize`, `/personality`, `/guess_who`, and AI replies run only in the Bhayanak server",
					"A message gets at most one bot reply: an autoresponse first, then a mention reply, then a random reply",
					"Bot messages ping nobody, except the people a reminder, level-up, or giveaway is for",
					"Staff commands are hidden from regular members, and each moderation command checks the permission that fits it",
					"Music controls need you in the bot's voice channel",
					"AI replies retry once on a backup model when the first one fails",
				],
			},
			{
				heading: "Removed",
				items: ["RPG, tickets, self-assign roles, and suggestions"],
			},
			{
				heading: "Fixed",
				items: [
					"Mutes and tempbans always lift on time, and moderation actions always match their case",
					"Reminders, polls, and giveaways finish only once they are delivered, and a giveaway ends exactly once",
					"Regex autoresponders can no longer freeze the bot",
					"Guess Who only uses messages that still exist and only counts typed mentions as guesses",
					"`/summarize` covers the newest messages, in order",
					"Personality profiles never quote messages word for word",
					"`/help` lists every command under its real name",
				],
			},
		],
	},
	{
		version: "2.8.0",
		date: "September 2026",
		tag: "trackers",
		groups: [
			{
				heading: "Added",
				items: [
					"Live Palworld player channels that show who is online",
					"A presence feed for the homelab dashboard",
					"Site redesign",
				],
			},
			{
				heading: "Fixed",
				items: [
					"The Palworld tracker hides itself while the server is offline and renames a player's channel when their name changes",
				],
			},
		],
	},
	{
		version: "2.7.0",
		date: "May 2026",
		tag: "archive",
		groups: [
			{
				heading: "Added",
				items: [
					"`/guess_who` message archive game",
					"Minecraft live map and Homestead version details",
					"Astro marketing site rewrite",
				],
			},
			{
				heading: "Changed",
				items: ["Command docs now track the live bot catalog", "Web UI moved to brutalist Discord-style pages"],
			},
		],
	},
	{
		version: "2.6.0",
		date: "April 2026",
		tag: "systems",
		groups: [
			{
				heading: "Added",
				items: ["Music queue controls and now-playing cards"],
			},
			{ heading: "Fixed", items: ["Moderation case tracking and scheduled expiry tasks"] },
		],
	},
];
