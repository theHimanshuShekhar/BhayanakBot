import { getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import { Listener } from "@sapphire/framework";
import { Events, type VoiceState } from "discord.js";
import { getOrCreateSettings } from "../../db/queries/guildSettings.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";
import { TARGET_GUILD_ID, VOICE_COOLDOWN_MS, VOICE_MIN_HUMANS_TO_JOIN } from "../../lib/constants.js";
import { isConnectedToVoice, runVoiceResponderSession } from "../../lib/voice/responder.js";

export class VoiceChannelMonitorListener extends Listener<typeof Events.VoiceStateUpdate> {
	private lastResponseTime = 0;
	private isListening = false;

	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.VoiceStateUpdate });
	}

	public async run(oldState: VoiceState, newState: VoiceState): Promise<void> {
		// Only monitor target guild
		if (newState.guild.id !== TARGET_GUILD_ID && oldState.guild.id !== TARGET_GUILD_ID) return;

		const settings = await getOrCreateSettings(newState.guild.id);
		if (!settings.voiceResponderEnabled) return;

		const guild = newState.guild;
		const member = newState.member ?? oldState.member;
		if (!member || member.user.bot) return;

		// Check all voice channels in the guild for human count
		for (const channel of guild.channels.cache.values()) {
			if (!channel.isVoiceBased() || channel.members.size === 0) continue;

			const humanCount = channel.members.filter((m) => !m.user.bot).size;
			const botInChannel = channel.members.has(this.container.client.id ?? "");

			// Auto-join if enough humans and bot not present and cooldown passed
			if (humanCount >= VOICE_MIN_HUMANS_TO_JOIN && !botInChannel && !this.isListening) {
				const now = Date.now();
				if (now - this.lastResponseTime < VOICE_COOLDOWN_MS) continue;

				await this.joinAndListen(channel.id, guild.id);
				return; // Only join one channel at a time
			}
		}
	}

	private async joinAndListen(channelId: string, guildId: string): Promise<void> {
		if (this.isListening || isConnectedToVoice(guildId)) return;

		this.isListening = true;

		const connection = joinVoiceChannel({
			channelId,
			guildId,
			adapterCreator: this.container.client.guilds.cache.get(guildId)!.voiceAdapterCreator,
			selfDeaf: false,
			selfMute: false,
		});

		try {
			await runVoiceResponderSession(connection, this.container.client as BhayanakClient, guildId);
		} catch (error) {
			console.error("[VoiceChannelMonitor] Session failed:", error);
			connection.destroy();
		} finally {
			this.isListening = false;
			this.lastResponseTime = Date.now();
		}
	}
}
