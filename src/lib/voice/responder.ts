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
	console.log(`[VoiceResponder] Starting session for guild ${guildId}`);

	// Wait for connection to be ready — entersState properly handles intermediate states
	try {
		console.log("[VoiceResponder] Waiting for voice connection to be Ready...");
		await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
		console.log("[VoiceResponder] Voice connection is Ready");
	} catch {
		console.error("[VoiceResponder] Voice connection timed out (15s)");
		connection.destroy();
		throw new Error("Voice connection timeout");
	}

	// Subscribe to audio
	console.log("[VoiceResponder] Subscribing to audio...");
	audioCleanup = subscribeToAudio(
		connection,
		(chunk) => {
			console.log(`[VoiceResponder] Audio chunk received from ${chunk.userId}, buffer=${chunk.pcmBuffer.length}b, dur=${chunk.durationMs}ms`);
			void handleAudioChunk(chunk, client, transcriptBuffer);
		},
		10_000, // 10-second chunks
	);
	console.log("[VoiceResponder] Audio subscription active");

	// Listen for a set duration then stop
	console.log(`[VoiceResponder] Listening for ${VOICE_LISTEN_DURATION_MS}ms...`);
	await new Promise<void>((resolve) => {
		setTimeout(() => {
			console.log("[VoiceResponder] Listen duration elapsed");
			resolve();
		}, VOICE_LISTEN_DURATION_MS);
	});

	// Unsubscribe from audio
	console.log(`[VoiceResponder] Unsubscribing from audio. Collected ${transcriptBuffer.length} transcripts.`);
	if (audioCleanup) {
		audioCleanup();
		audioCleanup = null;
	}

	// Generate response if we have transcripts
	if (transcriptBuffer.length > 0) {
		console.log("[VoiceResponder] Generating response...");
		await generateAndSpeakResponse(connection, client, guildId, transcriptBuffer);
	} else {
		console.log("[VoiceResponder] No transcripts collected, skipping response");
	}

	// Leave the channel
	console.log("[VoiceResponder] Destroying voice connection");
	connection.destroy();
}

async function handleAudioChunk(chunk: AudioChunk, client: BhayanakClient, transcriptBuffer: string[]): Promise<void> {
	console.log(`[VoiceResponder/handleAudioChunk] userId=${chunk.userId}, pcmLen=${chunk.pcmBuffer.length}`);
	const guild = client.guilds.cache.get(chunk.userId);
	const member = guild?.members.cache.get(chunk.userId);
	const username = member?.displayName ?? member?.user.username ?? chunk.userId;

	console.log(`[VoiceResponder/handleAudioChunk] Calling STT for ${username}...`);
	const transcript = await transcribeAudio(chunk.pcmBuffer);
	if (!transcript || transcript.trim().length === 0) {
		console.log(`[VoiceResponder/handleAudioChunk] STT returned empty for ${username}`);
		return;
	}

	console.log(`[Voice] ${username}: ${transcript}`);
	transcriptBuffer.push(`${username}: ${transcript}`);
}

async function generateAndSpeakResponse(
	connection: ReturnType<typeof joinVoiceChannel>,
	client: BhayanakClient,
	guildId: string,
	transcriptBuffer: string[],
): Promise<void> {
	console.log("[VoiceResponder/generateAndSpeakResponse] Starting response generation...");
	const guild = client.guilds.cache.get(guildId);
	if (!guild) {
		console.log("[VoiceResponder/generateAndSpeakResponse] Guild not found, aborting");
		return;
	}

	const guildProfile = client.guildPersonalityCache.get(guild.id);
	const conversation = transcriptBuffer.join("\n");
	console.log(`[VoiceResponder/generateAndSpeakResponse] Conversation length: ${conversation.length} chars`);
	const prompt = [
		"You are in a Discord voice chat. Here is what people have been saying:",
		conversation,
		"",
		"Respond to the conversation. Roast someone. Be savage, unhinged, and hilarious. Keep it under 2 sentences.",
	].join("\n");

	const systemPrompt = guildProfile
		? `You are a Discord bot with this personality: ${guildProfile}. You are currently in a voice chat with friends. Your job is to roast them mercilessly.`
		: "You are a savage Discord bot in a voice chat with friends. You do not hold back. You roast, you mock, you destroy. But you are hilarious.";
	console.log("[VoiceResponder/generateAndSpeakResponse] Calling Ollama...");
	const response = await callOllama(systemPrompt, prompt, 120_000, 200);

	if (!response || response.trim().length === 0) {
		console.log("[VoiceResponder/generateAndSpeakResponse] Ollama returned empty response");
		return;
	}

	console.log(`[Voice] Bot response: ${response}`);

	console.log("[VoiceResponder/generateAndSpeakResponse] Calling TTS...");
	const audioBuffer = await generateSpeech(response);
	if (!audioBuffer) {
		console.log("[VoiceResponder/generateAndSpeakResponse] TTS returned null");
		return;
	}
	console.log(`[VoiceResponder/generateAndSpeakResponse] TTS produced ${audioBuffer.length}b audio`);

	try {
		console.log("[VoiceResponder/generateAndSpeakResponse] Playing audio...");
		await playAudio(connection, audioBuffer);
		console.log("[VoiceResponder/generateAndSpeakResponse] Audio playback finished");
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
