import { getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import { Command } from "@sapphire/framework";
import { ApplicationCommandType, ChannelType, PermissionFlagsBits } from "discord.js";
import { TARGET_GUILD_ID } from "../../lib/constants.js";

export class VoiceResponderCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "voice-responder",
			description: "Manually control the voice responder",
			enabled: true,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName(this.name)
					.setDescription(this.description)
					.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
					.addSubcommand((sub) =>
						sub
							.setName("join")
							.setDescription("Force the bot to join your current voice channel")
							.addChannelOption((opt) =>
								opt
									.setName("channel")
									.setDescription("Voice channel to join (defaults to your current channel)")
									.addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
									.setRequired(false),
							),
					)
					.addSubcommand((sub) =>
						sub.setName("leave").setDescription("Force the bot to leave the current voice channel"),
					),
			{ idHints: [] },
		);
	}

	public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === "join") {
			return this.handleJoin(interaction);
		}

		if (subcommand === "leave") {
			return this.handleLeave(interaction);
		}

		return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
	}

	private async handleJoin(interaction: Command.ChatInputCommandInteraction) {
		// Only allow in target guild
		if (interaction.guildId !== TARGET_GUILD_ID) {
			return interaction.reply({
				content: "This command is only available in the designated server.",
				ephemeral: true,
			});
		}

		const channel = interaction.options.getChannel("channel");
		const memberChannel = interaction.guild?.members.cache.get(interaction.user.id)?.voice.channel;
		const voiceChannel =
			channel?.type === ChannelType.GuildVoice || channel?.type === ChannelType.GuildStageVoice
				? channel
				: memberChannel;

		if (!voiceChannel) {
			return interaction.reply({
				content: "You must be in a voice channel or specify one to join.",
				ephemeral: true,
			});
		}

		// Check if already connected
		const existing = getVoiceConnection(interaction.guildId!);
		if (existing) {
			return interaction.reply({
				content: "I'm already in a voice channel. Use `/voice-responder leave` first.",
				ephemeral: true,
			});
		}

		try {
			joinVoiceChannel({
				channelId: voiceChannel.id,
				guildId: interaction.guildId!,
				adapterCreator: interaction.guild!.voiceAdapterCreator,
				selfDeaf: false,
				selfMute: false,
			});

			return interaction.reply({
				content: `Joined ${voiceChannel.name}.`,
				ephemeral: true,
			});
		} catch (error) {
			console.error("[VoiceResponder] Failed to join:", error);
			return interaction.reply({
				content: "Failed to join the voice channel. Check my permissions.",
				ephemeral: true,
			});
		}
	}

	private async handleLeave(interaction: Command.ChatInputCommandInteraction) {
		const connection = getVoiceConnection(interaction.guildId!);
		if (!connection) {
			return interaction.reply({
				content: "I'm not in a voice channel right now.",
				ephemeral: true,
			});
		}

		connection.destroy();
		return interaction.reply({ content: "Left the voice channel.", ephemeral: true });
	}
}
