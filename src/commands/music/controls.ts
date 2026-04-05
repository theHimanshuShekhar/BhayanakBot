import { Subcommand } from "@sapphire/plugin-subcommands";
import { useQueue } from "discord-player";

export class MusicControlsCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "pause", chatInputRun: "runPause" },
				{ name: "resume", chatInputRun: "runResume" },
				{ name: "skip", chatInputRun: "runSkip" },
				{ name: "stop", chatInputRun: "runStop" },
				{ name: "disconnect", chatInputRun: "runDisconnect" },
			],
			preconditions: ["GuildOnly", "IsDJ"],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("music")
				.setDescription("Music playback controls")
				.addSubcommand((sub) => sub.setName("pause").setDescription("Pause the current song"))
				.addSubcommand((sub) => sub.setName("resume").setDescription("Resume playback"))
				.addSubcommand((sub) => sub.setName("skip").setDescription("Skip the current song"))
				.addSubcommand((sub) => sub.setName("stop").setDescription("Stop music and clear the queue"))
				.addSubcommand((sub) => sub.setName("disconnect").setDescription("Disconnect the bot from voice")),
		);
	}

	public async runPause(interaction: Subcommand.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue?.isPlaying()) {
			return interaction.reply({ content: "Nothing is playing.", ephemeral: true });
		}
		queue.node.pause();
		return interaction.reply({ content: "Paused." });
	}

	public async runResume(interaction: Subcommand.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue) {
			return interaction.reply({ content: "Nothing in the queue.", ephemeral: true });
		}
		queue.node.resume();
		return interaction.reply({ content: "Resumed." });
	}

	public async runSkip(interaction: Subcommand.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue?.currentTrack) {
			return interaction.reply({ content: "Nothing is playing.", ephemeral: true });
		}
		const skipped = queue.currentTrack.title;
		queue.node.skip();
		return interaction.reply({ content: `Skipped **${skipped}**.` });
	}

	public async runStop(interaction: Subcommand.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (!queue) {
			return interaction.reply({ content: "Nothing in the queue.", ephemeral: true });
		}
		queue.delete();
		return interaction.reply({ content: "Stopped music and cleared the queue." });
	}

	public async runDisconnect(interaction: Subcommand.ChatInputCommandInteraction) {
		const queue = useQueue(interaction.guildId!);
		if (queue) queue.delete();

		const voiceChannel = interaction.guild?.members.me?.voice.channel;
		if (voiceChannel) {
			interaction.guild?.members.me?.voice.disconnect();
		}

		return interaction.reply({ content: "Disconnected from voice." });
	}
}
