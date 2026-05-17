import { entersState, getVoiceConnection, type joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";
import type { BhayanakClient } from "../BhayanakClient.js";
import { VOICE_LISTEN_DURATION_MS } from "../constants.js";
import { callOllama } from "../ollama.js";
import { playAudio } from "./audioPlayer.js";
import { type AudioChunk, subscribeToAudio } from "./audioReceiver.js";
import { transcribeAudio } from "./stt.js";
import { generateSpeech } from "./tts.js";

/**
 * Run a full voice responder session: listen, transcribe, generate response, speak, leave.
 * This is used by both the auto-join listener and the manual admin command.
 */
export async function runVoiceResponderSession(
	connection: ReturnType<typeof joinVoiceChannel>,
	client: BhayanakClient,
	guildId: string,
): Promise<void> {
	const transcriptBuffer: string[] = [];
	let audioCleanup: (() => void) | null = null;

	// Wait for connection to be ready — entersState properly handles intermediate states
	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
	} catch {
		connection.destroy();
		throw new Error("Voice connection timeout");
	}

	// Subscribe to audio
	audioCleanup = subscribeToAudio(
		connection,
		(chunk) => {
			void handleAudioChunk(chunk, client, transcriptBuffer);
		},
		10_000, // 10-second chunks
	);

	// Listen for a set duration then stop
	await new Promise<void>((resolve) => {
		setTimeout(() => {
			resolve();
		}, VOICE_LISTEN_DURATION_MS);
	});

	// Unsubscribe from audio
	if (audioCleanup) {
		audioCleanup();
		audioCleanup = null;
	}

	// Generate response if we have transcripts
	if (transcriptBuffer.length > 0) {
		await generateAndSpeakResponse(connection, client, guildId, transcriptBuffer);
	}

	// Leave the channel
	connection.destroy();
}

async function handleAudioChunk(chunk: AudioChunk, client: BhayanakClient, transcriptBuffer: string[]): Promise<void> {
	const guild = client.guilds.cache.get(chunk.userId);
	const member = guild?.members.cache.get(chunk.userId);
	const username = member?.displayName ?? member?.user.username ?? chunk.userId;

	const transcript = await transcribeAudio(chunk.pcmBuffer);
	if (!transcript || transcript.trim().length === 0) return;

	console.log(`[Voice] ${username}: ${transcript}`);
	transcriptBuffer.push(`${username}: ${transcript}`);
}

async function generateAndSpeakResponse(
	connection: ReturnType<typeof joinVoiceChannel>,
	client: BhayanakClient,
	guildId: string,
	transcriptBuffer: string[],
): Promise<void> {
	const guild = client.guilds.cache.get(guildId);
	if (!guild) return;

	const guildProfile = client.guildPersonalityCache.get(guild.id);
	const conversation = transcriptBuffer.join("\n");
	const prompt = [
		"You are in a Discord voice chat. Here is what people have been saying:",
		conversation,
		"",
		"Respond to the conversation. Roast someone. Be savage, unhinged, and hilarious. Keep it under 2 sentences.",
	].join("\n");

	const systemPrompt = guildProfile
		? `You are a Discord bot with this personality: ${guildProfile}. You are currently in a voice chat with friends. Your job is to roast them mercilessly.`
		: "You are a savage Discord bot in a voice chat with friends. You do not hold back. You roast, you mock, you destroy. But you are hilarious.";
	const response = await callOllama(systemPrompt, prompt, 120_000, 200);

	if (!response || response.trim().length === 0) return;

	console.log(`[Voice] Bot response: ${response}`);

	const audioBuffer = await generateSpeech(response);
	if (!audioBuffer) return;

	try {
		await playAudio(connection, audioBuffer);
	} catch (error) {
		console.error("[Voice] Failed to play audio:", error);
	}
}

/**
 * Check if the bot is already connected to a voice channel in the given guild.
 */
export function isConnectedToVoice(guildId: string): boolean {
	return getVoiceConnection(guildId) !== undefined;
}
