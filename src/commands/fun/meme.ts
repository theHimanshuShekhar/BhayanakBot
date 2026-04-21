import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";

const SUBREDDITS = ["memes", "dankmemes", "me_irl", "wholesomememes"];

export class MemeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "Fetch a random meme from Reddit.",
				examples: ["/meme"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("meme").setDescription("Fetch a random meme from Reddit"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const subreddit = SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
		const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=50`;

		try {
			const res = await fetch(url, { headers: { "User-Agent": "BhayanakBot/1.0" } });
			if (!res.ok) throw new Error(`Reddit returned ${res.status}`);

			const data = (await res.json()) as { data: { children: Array<{ data: { over_18: boolean; is_video: boolean; url: string; title: string; score: number; subreddit: string } }> } };
			const posts = data.data.children
				.map((c) => c.data)
				.filter((p) => !p.over_18 && !p.is_video && /\.(jpg|jpeg|png|gif)$/i.test(p.url));

			if (posts.length === 0) {
				return interaction.editReply({ content: "No memes found. Try again!" });
			}

			const post = posts[Math.floor(Math.random() * posts.length)];

			const embed = new EmbedBuilder()
				.setTitle(post.title.slice(0, 256))
				.setImage(post.url)
				.setColor(0xff4500)
				.setFooter({ text: `r/${post.subreddit} · 👍 ${post.score.toLocaleString()}` });

			return interaction.editReply({ embeds: [embed] });
		} catch {
			return interaction.editReply({ content: "Failed to fetch a meme. Reddit might be down." });
		}
	}
}
