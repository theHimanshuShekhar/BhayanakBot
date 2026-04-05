import { Command } from "@sapphire/framework";
import { EmbedBuilder , MessageFlags } from "discord.js";
import { useQueue } from "discord-player";

export class QueueCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("queue")
				.setDescription("Show the current music queue")
				.addIntegerOption((opt) =>
					opt.setName("page").setDescription("Page number").setMinValue(1).setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue?.currentTrack) {
			return interaction.reply({ content: "Nothing is playing.", flags: MessageFlags.Ephemeral });
		}

		const page = interaction.options.getInteger("page") ?? 1;
		const pageSize = 10;
		const tracks = queue.tracks.toArray();
		const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));

		const pageTracks = tracks.slice((page - 1) * pageSize, page * pageSize);

		const lines = pageTracks.map(
			(t, i) => `${(page - 1) * pageSize + i + 1}. **${t.title}** — ${t.author} \`${t.duration}\``,
		);

		const embed = new EmbedBuilder()
			.setTitle("Music Queue")
			.setColor(0x5865f2)
			.addFields({ name: "Now Playing", value: `**${queue.currentTrack.title}** — ${queue.currentTrack.author}` })
			.setFooter({ text: `Page ${page}/${totalPages} · ${tracks.length} track(s) in queue` });

		if (lines.length > 0) {
			embed.addFields({ name: "Up Next", value: lines.join("\n") });
		}

		return interaction.reply({ embeds: [embed] });
	}
}
