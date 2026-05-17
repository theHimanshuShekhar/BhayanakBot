import OpenAI from "openai";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Transcribe PCM audio buffer using OpenAI Whisper.
 * Converts PCM to WAV format first (Whisper requires a file format).
 */
export async function transcribeAudio(pcmBuffer: Buffer): Promise<string | null> {
	if (!process.env.OPENAI_API_KEY) {
		console.warn("[STT] No OPENAI_API_KEY set, skipping transcription");
		return null;
	}

	try {
		// Convert PCM to WAV
		const wavBuffer = pcmToWav(pcmBuffer, 48000, 2);

		const file = new File([new Uint8Array(wavBuffer)], "audio.wav", { type: "audio/wav" });

		const result = await openai.audio.transcriptions.create({
			file,
			model: "whisper-1",
			language: "en",
		});

		return result.text || null;
	} catch (error) {
		console.error("[STT] Transcription failed:", error);
		return null;
	}
}

/**
 * Convert raw PCM buffer to WAV format.
 */
function pcmToWav(pcmBuffer: Buffer, sampleRate: number, channels: number): Buffer {
	const byteRate = sampleRate * channels * 2;
	const blockAlign = channels * 2;
	const dataSize = pcmBuffer.length;
	const headerSize = 44;
	const totalSize = headerSize + dataSize;

	const wavBuffer = Buffer.alloc(totalSize);

	// RIFF chunk descriptor
	wavBuffer.write("RIFF", 0);
	wavBuffer.writeUInt32LE(totalSize - 8, 4);
	wavBuffer.write("WAVE", 8);

	// fmt sub-chunk
	wavBuffer.write("fmt ", 12);
	wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
	wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
	wavBuffer.writeUInt16LE(channels, 22);
	wavBuffer.writeUInt32LE(sampleRate, 24);
	wavBuffer.writeUInt32LE(byteRate, 28);
	wavBuffer.writeUInt16LE(blockAlign, 32);
	wavBuffer.writeUInt16LE(16, 34); // BitsPerSample

	// data sub-chunk
	wavBuffer.write("data", 36);
	wavBuffer.writeUInt32LE(dataSize, 40);
	pcmBuffer.copy(wavBuffer, 44);

	return wavBuffer;
}
