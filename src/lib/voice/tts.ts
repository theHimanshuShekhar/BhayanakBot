import OpenAI from "openai";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate speech audio from text using OpenAI TTS-1.
 * Returns a Buffer containing MP3 audio data.
 */
export async function generateSpeech(text: string): Promise<Buffer | null> {
	if (!process.env.OPENAI_API_KEY) {
		console.warn("[TTS] No OPENAI_API_KEY set, skipping speech generation");
		return null;
	}

	try {
		const response = await openai.audio.speech.create({
			model: "tts-1",
			voice: "onyx", // Deep, authoritative voice
			input: text,
			response_format: "mp3",
		});

		const arrayBuffer = await response.arrayBuffer();
		return Buffer.from(arrayBuffer);
	} catch (error) {
		console.error("[TTS] Speech generation failed:", error);
		return null;
	}
}
