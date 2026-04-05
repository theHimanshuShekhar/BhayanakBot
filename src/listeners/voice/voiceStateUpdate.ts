import { Listener } from "@sapphire/framework";
import type { VoiceState } from "discord.js";
import { useQueue } from "discord-player";

export class VoiceStateUpdateListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "voiceStateUpdate" });
	}

	public override run(oldState: VoiceState, newState: VoiceState) {
		const guild = oldState.guild ?? newState.guild;
		const botMember = guild.members.me;
		if (!botMember?.voice.channel) return;

		// If the bot was moved or disconnected externally
		if (oldState.member?.id === botMember.id && !newState.channelId) {
			const queue = useQueue(guild.id);
			queue?.delete();
			return;
		}

		// If bot is now alone in its voice channel, stop and leave
		const botChannel = botMember.voice.channel;
		const humanMembers = botChannel.members.filter((m) => !m.user.bot);
		if (humanMembers.size === 0) {
			const queue = useQueue(guild.id);
			if (queue) {
				setTimeout(() => {
					// Re-check after 30 seconds to avoid leaving immediately on temporary absences
					const recheckQueue = useQueue(guild.id);
					if (!recheckQueue) return;
					const stillAlone = botChannel.members.filter((m) => !m.user.bot).size === 0;
					if (stillAlone) recheckQueue.delete();
				}, 30_000);
			}
		}
	}
}
