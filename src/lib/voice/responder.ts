import { entersState, getVoiceConnection, type joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";
import type { BhayanakClient } from "../BhayanakClient.js";
import { VOICE_LISTEN_DURATION_MS } from "../constants.js";
import { callOllama } from "../ollama.js";
import { getPersonalityContext } from "../personality/getPersonalityContext.js";
import { playAudio } from "./audioPlayer.js";
import { type AudioChunk, subscribeToAudio } from "./audioReceiver.js";
import { transcribeAudio } from "./stt.js";
import { generateSpeech } from "./tts.js";

const TEXT_HISTORY_LIMIT = 20;
const OLLAMA_TIMEOUT_MS = 120_000;

interface TranscriptEntry {
	userId: string;
	username: string;
	transcript: string;
}

/**
 * Run a full voice responder session: listen, transcribe, generate response, speak, leave.
 * This is used by both the auto-join listener and the manual admin command.
 */
export async function runVoiceResponderSession(
	connection: ReturnType<typeof joinVoiceChannel>,
	client: BhayanakClient,
	guildId: string,
): Promise<void> {
	const transcriptBuffer: TranscriptEntry[] = [];
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
			console.log(
				`[VoiceResponder] Audio chunk received from ${chunk.userId}, buffer=${chunk.pcmBuffer.length}b, dur=${chunk.durationMs}ms`,
			);
			void handleAudioChunk(chunk, client, guildId, transcriptBuffer);
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

async function handleAudioChunk(
	chunk: AudioChunk,
	client: BhayanakClient,
	guildId: string,
	transcriptBuffer: TranscriptEntry[],
): Promise<void> {
	console.log(`[VoiceResponder/handleAudioChunk] userId=${chunk.userId}, pcmLen=${chunk.pcmBuffer.length}`);

	const guild = client.guilds.cache.get(guildId);
	const member = guild?.members.cache.get(chunk.userId);
	const username = member?.displayName ?? member?.user?.username ?? chunk.userId;

	console.log(`[VoiceResponder/handleAudioChunk] Calling STT for ${username}...`);
	const transcript = await transcribeAudio(chunk.pcmBuffer);
	if (!transcript || transcript.trim().length === 0) {
		console.log(`[VoiceResponder/handleAudioChunk] STT returned empty for ${username}`);
		return;
	}

	console.log(`[Voice] ${username}: ${transcript}`);
	transcriptBuffer.push({ userId: chunk.userId, username, transcript });
}

async function generateAndSpeakResponse(
	connection: ReturnType<typeof joinVoiceChannel>,
	client: BhayanakClient,
	guildId: string,
	transcriptBuffer: TranscriptEntry[],
): Promise<void> {
	console.log("[VoiceResponder/generateAndSpeakResponse] Starting response generation...");
	const guild = client.guilds.cache.get(guildId);
	if (!guild) {
		console.log("[VoiceResponder/generateAndSpeakResponse] Guild not found, aborting");
		return;
	}

	// --- 1. Fetch text channel history for broader context ---
	let textHistory = "";
	try {
		// Try to find a relevant text channel: same category as voice channel, or system channel
		const voiceChannel = guild.channels.cache.get(connection.joinConfig.channelId);
		let targetTextChannel = guild.systemChannel;

		if (voiceChannel?.parentId) {
			const siblingText = guild.channels.cache.find(
				(ch) => ch.isTextBased() && ch.parentId === voiceChannel.parentId && !ch.isVoiceBased(),
			);
			if (siblingText?.isTextBased()) targetTextChannel = siblingText;
		}

		if (targetTextChannel?.isTextBased()) {
			const fetched = await targetTextChannel.messages.fetch({ limit: TEXT_HISTORY_LIMIT }).catch(() => null);
			if (fetched) {
				const messages = [...fetched.values()]
					.reverse()
					.filter((m) => !m.author.bot && m.content.trim().length > 0)
					.map((m) => `${m.author.displayName}: ${m.content.trim()}`)
					.join("\n");
				if (messages) textHistory = messages;
			}
		}
	} catch (err) {
		console.log(`[VoiceResponder] Failed to fetch text history: ${err instanceof Error ? err.message : String(err)}`);
	}

	// --- 2. Build voice transcript log ---
	const voiceTranscripts = transcriptBuffer.map((t) => `${t.username}: ${t.transcript}`).join("\n");
	const latestSpeaker = transcriptBuffer[transcriptBuffer.length - 1];

	// --- 3. Get personality context for the most recent speaker ---
	let personalityCtx = "";
	try {
		if (latestSpeaker) {
			personalityCtx = await getPersonalityContext(client, latestSpeaker.userId, guildId);
		}
	} catch (err) {
		console.log(
			`[VoiceResponder] Failed to get personality context: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// --- 4. Build guild personality context ---
	const guildProfile = client.guildPersonalityCache.get(guild.id);
	const voiceChannelName = guild.channels.cache.get(connection.joinConfig.channelId)?.name ?? "voice chat";

	// --- 5. Construct prompt ---
	const systemPrompt = [
		`You are a witty Discord bot hanging out in the voice channel "${voiceChannelName}" in the server "${guild.name}".`,
		`You are NOT a generic roaster. You are an observational comedian who makes jokes ABOUT the specific topics people are discussing.`,
		`Your job: listen to what they are talking about, then make a funny, topical joke or observation ABOUT that subject.`,
		`Reference specific things people said. Mock their bad takes. Find the absurdity in the actual conversation topic.`,
		`Keep it to 1-2 sentences. Be punchy. No greetings. No explaining the joke.`,
		`If the conversation is about a game, joke about the game. If it's about someone's bad decision, mock the decision. If it's about food, joke about food.`,
		personalityCtx,
		guildProfile ? `\nThis server's vibe: ${guildProfile}` : "",
	]
		.filter(Boolean)
		.join("\n");

	const promptParts: string[] = [];

	if (textHistory) {
		promptParts.push("Recent messages from the text chat (for context on what people have been talking about):");
		promptParts.push(textHistory);
		promptParts.push("");
	}

	promptParts.push("Here is what people just said in the voice channel (this is the main thing to respond to):");
	promptParts.push(voiceTranscripts);
	promptParts.push("");
	promptParts.push(
		`Respond with a funny, topical joke or observation ABOUT what "${latestSpeaker?.username ?? "they"}" just said or the topic being discussed. Reference the actual subject. Do not be generic.`,
	);

	const prompt = promptParts.join("\n");
	console.log(`[VoiceResponder/generateAndSpeakResponse] Prompt length: ${prompt.length} chars`);

	console.log("[VoiceResponder/generateAndSpeakResponse] Calling Ollama...");
	const response = await callOllama(systemPrompt, prompt, OLLAMA_TIMEOUT_MS, 200);

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
