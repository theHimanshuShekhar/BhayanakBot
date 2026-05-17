import { spawn } from "node:child_process";

const PIPER_BINARY = process.env.PIPER_BINARY ?? "piper";
const PIPER_MODEL = process.env.PIPER_MODEL ?? "en_US-lessac-medium.onnx";

/**
 * Generate speech audio from text using self-hosted Piper TTS.
 * Returns a Buffer containing WAV audio data.
 */
export async function generateSpeech(text: string): Promise<Buffer | null> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		const child = spawn(PIPER_BINARY, [
			"--model",
			PIPER_MODEL,
			"--output_file",
			"-", // stdout
			"--sentence_silence",
			"0.2",
		]);

		child.stdout.on("data", (chunk: Buffer) => {
			chunks.push(chunk);
		});

		child.on("close", (code) => {
			if (code !== 0) {
				console.error(`[TTS] Piper exited with code ${code}`);
				resolve(null);
			} else {
				resolve(Buffer.concat(chunks));
			}
		});

		child.on("error", (error) => {
			console.error("[TTS] Failed to spawn Piper:", error);
			resolve(null);
		});

		child.stdin.write(text);
		child.stdin.end();
	});
}
