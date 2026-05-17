import type { Transform } from "node:stream";
import { EndBehaviorType, type VoiceConnection } from "@discordjs/voice";
import type { GuildMember, User } from "discord.js";
import prism from "prism-media";

export interface AudioChunk {
	userId: string;
	username: string;
	pcmBuffer: Buffer;
	durationMs: number;
}

/**
 * Subscribe to a voice connection and collect PCM audio from all users.
 * Returns a cleanup function to unsubscribe.
 */
export function subscribeToAudio(
	connection: VoiceConnection,
	onChunk: (chunk: AudioChunk) => void,
	chunkDurationMs = 10_000,
): () => void {
	const receiver = connection.receiver;

	const subscription = receiver.subscribe("", {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			duration: 100,
		},
	});

	// We need to handle per-user streams manually since subscribe("") doesn't give us user separation
	// Instead, we'll use the speaking event to track users
	const userStreams = new Map<string, { opus: Transform; pcm: Transform; startTime: number }>();

	receiver.speaking.on("start", (userId: string) => {
		if (userStreams.has(userId)) return;

		const opusDecoder = new prism.opus.Decoder({
			rate: 48_000,
			channels: 2,
			frameSize: 960,
		});

		const pcmBuffer: Buffer[] = [];
		const startTime = Date.now();

		opusDecoder.on("data", (chunk: Buffer) => {
			pcmBuffer.push(chunk);
		});

		opusDecoder.on("error", (err: Error) => {
			console.warn(`[Voice] Opus decoder error for user ${userId}:`, err.message);
			userStreams.delete(userId);
		});

		const userStream = receiver.subscribe(userId, {
			end: {
				behavior: EndBehaviorType.AfterSilence,
				duration: 100,
			},
		});

		userStream.on("error", (err: Error) => {
			console.warn(`[Voice] Audio stream error for user ${userId}:`, err.message);
			userStreams.delete(userId);
		});

		userStream.pipe(opusDecoder);

		userStreams.set(userId, {
			opus: opusDecoder,
			pcm: opusDecoder,
			startTime,
		});

		// Set up chunk timeout
		const chunkTimeout = setTimeout(() => {
			const data = userStreams.get(userId);
			if (!data) return;

			const fullBuffer = Buffer.concat(pcmBuffer);
			const durationMs = Date.now() - data.startTime;

			// Get user info from the guild
			const guild = connection.joinConfig.guildId;
			// We'll pass userId and let the caller resolve username
			onChunk({
				userId,
				username: userId, // placeholder, resolved by caller
				pcmBuffer: fullBuffer,
				durationMs,
			});

			// Restart collection
			pcmBuffer.length = 0;
			userStreams.set(userId, {
				opus: opusDecoder,
				pcm: opusDecoder,
				startTime: Date.now(),
			});
		}, chunkDurationMs);

		// Store timeout on the decoder for cleanup
		(opusDecoder as any)._chunkTimeout = chunkTimeout;
	});

	receiver.speaking.on("end", (userId: string) => {
		const data = userStreams.get(userId);
		if (!data) return;

		// Clear chunk timeout
		if ((data.opus as any)._chunkTimeout) {
			clearTimeout((data.opus as any)._chunkTimeout);
		}

		// Get final buffer
		const pcmBuffer: Buffer[] = [];
		data.opus.on("data", (chunk: Buffer) => {
			pcmBuffer.push(chunk);
		});

		// Wait a bit for remaining data then emit
		setTimeout(() => {
			const fullBuffer = Buffer.concat(pcmBuffer);
			const durationMs = Date.now() - data.startTime;

			if (fullBuffer.length > 0) {
				onChunk({
					userId,
					username: userId,
					pcmBuffer: fullBuffer,
					durationMs,
				});
			}

			userStreams.delete(userId);
		}, 500);
	});

	return () => {
		receiver.speaking.removeAllListeners("start");
		receiver.speaking.removeAllListeners("end");
		for (const [_, data] of userStreams) {
			if ((data.opus as any)._chunkTimeout) {
				clearTimeout((data.opus as any)._chunkTimeout);
			}
			data.opus.destroy();
		}
		userStreams.clear();
		subscription.destroy();
	};
}
