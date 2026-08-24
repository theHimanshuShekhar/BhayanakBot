export const releases = [
	{
		version: "2.7.0",
		date: "May 2026",
		tag: "current",
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
