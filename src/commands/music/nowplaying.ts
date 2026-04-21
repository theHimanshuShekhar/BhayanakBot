import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { useQueue } from "discord-player";
import { buildNowPlayingEmbed } from "../../lib/music/embeds.js";
import { buildNowPlayingButtons } from "../../lib/music/components.js";

export class NowPlayingCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "Show the currently playing song with progress bar.",
				examples: ["/nowplaying"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("nowplaying").setDescription("Show the currently playing song"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue?.currentTrack) {
			return interaction.reply({ content: "Nothing is currently playing.", flags: MessageFlags.Ephemeral });
		}

		return interaction.reply({
			embeds: [buildNowPlayingEmbed(queue, queue.currentTrack)],
			components: [buildNowPlayingButtons(queue)],
		});
	}
}
