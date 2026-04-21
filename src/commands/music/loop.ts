import { MessageFlags } from "discord.js";
import { Command } from "@sapphire/framework";
import { useQueue, QueueRepeatMode } from "discord-player";

const modeMap: Record<string, QueueRepeatMode> = {
	off: QueueRepeatMode.OFF,
	track: QueueRepeatMode.TRACK,
	queue: QueueRepeatMode.QUEUE,
};

const modeNames: Record<string, string> = {
	off: "Off",
	track: "Track",
	queue: "Queue",
};

export class LoopCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly", "IsDJ"],
			help: {
				summary: "Set the queue loop mode (off, track, or queue).",
				examples: ["/loop mode:track", "/loop mode:queue", "/loop mode:off"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("loop")
				.setDescription("Set the loop mode for music playback")
				.addStringOption((opt) =>
					opt
						.setName("mode")
						.setDescription("Loop mode")
						.addChoices(
							{ name: "Off", value: "off" },
							{ name: "Track (repeat current)", value: "track" },
							{ name: "Queue (repeat all)", value: "queue" },
						)
						.setRequired(true),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue?.isPlaying()) {
			return interaction.reply({ content: "Nothing is playing.", flags: MessageFlags.Ephemeral });
		}

		const mode = interaction.options.getString("mode", true);
		queue.setRepeatMode(modeMap[mode]);
		return interaction.reply({ content: `Loop mode set to **${modeNames[mode]}**.` });
	}
}
