import { joinVoiceChannel } from "@discordjs/voice";
import { Command } from "@sapphire/framework";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import { isConnectedToVoice, runVoiceResponderSession } from "../../lib/voice/responder.js";

export class VoiceJoinCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "voice-join",
			description: "Manually trigger the voice responder to join and run a full session",
			preconditions: ["IsAdmin"],
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) =>
				builder
					.setName(this.name)
					.setDescription(this.description)
					.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
					.addChannelOption((opt) =>
						opt
							.setName("channel")
							.setDescription("Voice channel to join (defaults to your current channel)")
							.addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
							.setRequired(false),
					),
			{ idHints: [] },
		);
	}

	public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const settings = await getOrCreateSettings(interaction.guildId!);
		if (!settings.voiceResponderEnabled) {
			return interaction.reply({
				content:
					"❌ Voice responder is disabled for this server. Use `/config set voice-responder-enabled true` to enable it.",
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

		if (isConnectedToVoice(interaction.guildId!)) {
			return interaction.reply({
				content: "I'm already in a voice channel. Use `/voice-responder leave` first.",
				ephemeral: true,
			});
		}

		await interaction.deferReply();

		try {
			const connection = joinVoiceChannel({
				channelId: voiceChannel.id,
				guildId: interaction.guildId!,
				adapterCreator: interaction.guild!.voiceAdapterCreator,
				selfDeaf: false,
				selfMute: false,
			});

			await interaction.editReply({
				content: `Joined ${voiceChannel.name}.`,
			});

			// Run the full listen/respond/leave flow
			await runVoiceResponderSession(connection, this.container.client as any, interaction.guildId!);
		} catch (error) {
			console.error("[VoiceJoin] Failed:", error);
			return interaction.editReply({
				content: "Failed to complete the voice session. Check my permissions and voice services.",
			});
		}
	}
}
