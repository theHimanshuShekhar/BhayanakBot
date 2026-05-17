import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PIPER_BINARY = process.env.PIPER_BINARY ?? "piper";
const PIPER_MODEL = process.env.PIPER_MODEL ?? "en_US-lessac-medium.onnx";

let piperAvailable: boolean | undefined;

async function isPiperAvailable(): Promise<boolean> {
	if (piperAvailable !== undefined) return piperAvailable;
	try {
		// fs.access does not search PATH, so use "which" to resolve the binary
		await execFileAsync("which", [PIPER_BINARY]);
		piperAvailable = true;
	} catch {
		console.warn(`[TTS] Binary not found in PATH: ${PIPER_BINARY}. Voice synthesis disabled.`);
		piperAvailable = false;
	}
	return piperAvailable;
}

/**
 * Generate speech audio from text using self-hosted Piper TTS.
 * Returns a Buffer containing WAV audio data.
 */
export async function generateSpeech(text: string): Promise<Buffer | null> {
	console.log(`[TTS] generateSpeech called, text="${text.substring(0, 80)}..."`);
	if (!(await isPiperAvailable())) {
		console.log("[TTS] Piper not available, skipping");
		return null;
	}

	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		console.log(`[TTS] Spawning: ${PIPER_BINARY} --model ${PIPER_MODEL}`);
		const child = spawn(PIPER_BINARY, [
			"--model",
			PIPER_MODEL,
			"--output_file",
			"-", // stdout
			"--sentence_silence",
			"0.2",
		]);

		child.stdout.on("data", (chunk: Buffer) => {
			console.log(`[TTS] Piper stdout chunk: ${chunk.length}b`);
			chunks.push(chunk);
		});

		child.on("close", (code) => {
			if (code !== 0) {
				console.error(`[TTS] Piper exited with code ${code}`);
				resolve(null);
			} else {
				const buf = Buffer.concat(chunks);
				console.log(`[TTS] Piper finished, total audio: ${buf.length}b`);
				resolve(buf);
			}
		});

		child.on("error", (error) => {
			console.error("[TTS] Failed to spawn Piper:", error);
			resolve(null);
		});

		child.stdin.write(text);
		child.stdin.end();
		console.log("[TTS] Sent text to Piper stdin");
	});
}
