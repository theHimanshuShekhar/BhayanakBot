import {
	AudioPlayerStatus,
	createAudioPlayer,
	getVoiceConnection,
	joinVoiceChannel,
	VoiceConnectionStatus,
} from "@discordjs/voice";
import { Listener } from "@sapphire/framework";
import { Events, type VoiceState } from "discord.js";
import type { BhayanakClient } from "../../lib/BhayanakClient.js";
import {
	TARGET_GUILD_ID,
	VOICE_COOLDOWN_MS,
	VOICE_LISTEN_DURATION_MS,
	VOICE_MIN_HUMANS_TO_JOIN,
} from "../../lib/constants.js";
import { callOllama } from "../../lib/ollama.js";
import { getPersonalityContext } from "../../lib/personality/getPersonalityContext.js";
import { playAudio } from "../../lib/voice/audioPlayer.js";
import { type AudioChunk, subscribeToAudio } from "../../lib/voice/audioReceiver.js";
import { transcribeAudio } from "../../lib/voice/stt.js";
import { generateSpeech } from "../../lib/voice/tts.js";

export class VoiceChannelMonitorListener extends Listener<typeof Events.VoiceStateUpdate> {
	private lastResponseTime = 0;
	private isListening = false;
	private audioCleanup: (() => void) | null = null;
	private transcriptBuffer: string[] = [];

	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.VoiceStateUpdate });
	}

	public async run(oldState: VoiceState, newState: VoiceState): Promise<void> {
		// Only monitor target guild
		if (newState.guild.id !== TARGET_GUILD_ID && oldState.guild.id !== TARGET_GUILD_ID) return;

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
		this.isListening = true;
		this.transcriptBuffer = [];

		const connection = joinVoiceChannel({
			channelId,
			guildId,
			adapterCreator: this.container.client.guilds.cache.get(guildId)!.voiceAdapterCreator,
			selfDeaf: false,
			selfMute: false,
		});

		// Wait for connection to be ready
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error("Voice connection timeout")), 10_000);
			connection.on(VoiceConnectionStatus.Ready, () => {
				clearTimeout(timeout);
				resolve();
			});
			connection.on(VoiceConnectionStatus.Disconnected, () => {
				clearTimeout(timeout);
				reject(new Error("Voice connection disconnected"));
			});
		});

		// Subscribe to audio
		this.audioCleanup = subscribeToAudio(
			connection,
			(chunk) => this.handleAudioChunk(chunk),
			10_000, // 10-second chunks
		);

		// Listen for a set duration
		setTimeout(() => {
			this.stopListening(connection);
		}, VOICE_LISTEN_DURATION_MS);
	}

	private async handleAudioChunk(chunk: AudioChunk): Promise<void> {
		// Resolve username from guild member
		const guild = this.container.client.guilds.cache.get(TARGET_GUILD_ID);
		const member = guild?.members.cache.get(chunk.userId);
		const username = member?.displayName ?? member?.user.username ?? chunk.userId;

		// Transcribe
		const transcript = await transcribeAudio(chunk.pcmBuffer);
		if (!transcript || transcript.trim().length === 0) return;

		console.log(`[Voice] ${username}: ${transcript}`);
		this.transcriptBuffer.push(`${username}: ${transcript}`);
	}

	private async stopListening(connection: ReturnType<typeof joinVoiceChannel>): Promise<void> {
		if (!this.isListening) return;
		this.isListening = false;
		this.lastResponseTime = Date.now();

		// Unsubscribe from audio
		if (this.audioCleanup) {
			this.audioCleanup();
			this.audioCleanup = null;
		}

		// Generate response if we have transcripts
		if (this.transcriptBuffer.length > 0) {
			await this.generateAndSpeakResponse(connection);
		}

		// Leave the channel
		connection.destroy();
	}

	private async generateAndSpeakResponse(connection: ReturnType<typeof joinVoiceChannel>): Promise<void> {
		const guild = this.container.client.guilds.cache.get(TARGET_GUILD_ID);
		if (!guild) return;

		// Get guild personality context
		const client = this.container.client as BhayanakClient;
		const guildProfile = client.guildPersonalityCache.get(guild.id);

		// Build conversation context
		const conversation = this.transcriptBuffer.join("\n");
		const prompt = [
			"You are in a Discord voice chat. Here is what people have been saying:",
			conversation,
			"",
			"Respond naturally to the conversation. Be funny, witty, or insightful. Keep it under 2 sentences.",
		].join("\n");

		// Generate response using Ollama
		const systemPrompt = guildProfile
			? `You are a Discord bot with this personality: ${guildProfile}. You are currently in a voice chat with friends.`
			: "You are a friendly Discord bot in a voice chat with friends.";
		const response = await callOllama(systemPrompt, prompt, 120_000, 200);

		if (!response || response.trim().length === 0) return;

		console.log(`[Voice] Bot response: ${response}`);

		// Generate speech
		const audioBuffer = await generateSpeech(response);
		if (!audioBuffer) return;

		// Play audio
		try {
			await playAudio(connection, audioBuffer);
		} catch (error) {
			console.error("[Voice] Failed to play audio:", error);
		}
	}
}
