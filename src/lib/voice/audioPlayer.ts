import { Readable } from "node:stream";
import {
	AudioPlayerStatus,
	createAudioPlayer,
	createAudioResource,
	StreamType,
	type VoiceConnection,
} from "@discordjs/voice";

/**
 * Play audio buffer (WAV or MP3) through a Discord voice connection.
 * Returns a promise that resolves when playback finishes.
 */
export async function playAudio(connection: VoiceConnection, audioBuffer: Buffer): Promise<void> {
	console.log(`[AudioPlayer] playAudio called, buffer=${audioBuffer.length}b`);
	return new Promise((resolve, reject) => {
		const player = createAudioPlayer();
		const subscription = connection.subscribe(player);
		console.log("[AudioPlayer] Audio player created and subscribed");

		const stream = Readable.from([audioBuffer]);
		const resource = createAudioResource(stream, {
			inputType: StreamType.Arbitrary,
		});

		player.play(resource);
		console.log("[AudioPlayer] Playback started");

		player.on(AudioPlayerStatus.Idle, () => {
			console.log("[AudioPlayer] Playback finished (Idle)");
			player.stop();
			subscription?.unsubscribe();
			resolve();
		});

		player.on("error", (error) => {
			console.error("[AudioPlayer] Playback error:", error);
			player.stop();
			subscription?.unsubscribe();
			reject(error);
		});
	});
}
