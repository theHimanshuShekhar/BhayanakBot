import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { useQueue } from "discord-player";
import { buildQueueEmbed, QUEUE_PAGE_SIZE } from "../../lib/music/embeds.js";
import { buildQueuePageButtons } from "../../lib/music/components.js";

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
		const totalPages = Math.max(1, Math.ceil(queue.tracks.toArray().length / QUEUE_PAGE_SIZE));

		return interaction.reply({
			embeds: [buildQueueEmbed(queue, page)],
			components: [buildQueuePageButtons(page, totalPages)],
		});
	}
}
