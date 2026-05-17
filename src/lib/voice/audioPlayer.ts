import {
	createAudioPlayer,
	createAudioResource,
	AudioPlayerStatus,
	VoiceConnection,
	StreamType,
} from "@discordjs/voice";
import { Readable } from "node:stream";

/**
 * Play MP3 audio buffer through a Discord voice connection.
 * Returns a promise that resolves when playback finishes.
 */
export async function playAudio(connection: VoiceConnection, mp3Buffer: Buffer): Promise<void> {
	return new Promise((resolve, reject) => {
		const player = createAudioPlayer();
		const subscription = connection.subscribe(player);

		const stream = Readable.from([mp3Buffer]);
		const resource = createAudioResource(stream, {
			inputType: StreamType.Arbitrary,
		});

		player.play(resource);

		player.on(AudioPlayerStatus.Idle, () => {
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
