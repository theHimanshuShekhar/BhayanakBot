import { execFile } from "node:child_process";
import { access, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const WHISPER_BINARY = process.env.WHISPER_BINARY ?? "whisper-cli";
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? "ggml-base.en.bin";

let whisperAvailable: boolean | undefined;

async function isWhisperAvailable(): Promise<boolean> {
	if (whisperAvailable !== undefined) return whisperAvailable;
	try {
		// fs.access does not search PATH, so use "which" to resolve the binary
		await execFileAsync("which", [WHISPER_BINARY]);
		whisperAvailable = true;
	} catch {
		console.warn(`[STT] Binary not found in PATH: ${WHISPER_BINARY}. Voice transcription disabled.`);
		whisperAvailable = false;
	}
	return whisperAvailable;
}

/**
 * Transcribe PCM audio buffer using self-hosted whisper.cpp.
 * Converts PCM to WAV, writes to temp file, runs whisper.cpp binary, returns transcript.
 */
export async function transcribeAudio(pcmBuffer: Buffer): Promise<string | null> {
	console.log(`[STT] transcribeAudio called, pcmBuffer=${pcmBuffer.length}b`);
	if (!(await isWhisperAvailable())) {
		console.log("[STT] Whisper not available, skipping");
		return null;
	}

	const tmpWav = join(tmpdir(), `bhayanak-stt-${Date.now()}.wav`);
	console.log(`[STT] Writing temp WAV: ${tmpWav}`);

	try {
		// Convert PCM to WAV and write temp file
		const wavBuffer = pcmToWav(pcmBuffer, 48_000, 2);
		console.log(`[STT] WAV buffer size: ${wavBuffer.length}b`);
		await writeFile(tmpWav, wavBuffer);

		// Run whisper.cpp
		console.log(`[STT] Running whisper: ${WHISPER_BINARY} -m ${WHISPER_MODEL} -f ${tmpWav}`);
		const { stdout, stderr } = await execFileAsync(
			WHISPER_BINARY,
			["-m", WHISPER_MODEL, "-f", tmpWav, "--output-txt", "--no-timestamps", "--language", "en"],
			{ timeout: 30_000 },
		);
		console.log(`[STT] Whisper stderr: ${stderr}`);
		console.log(`[STT] Whisper stdout length: ${stdout.length}`);

		// Parse output — whisper.cpp prints transcript to stdout when --output-txt is used
		// or we can read the generated .txt file. Let's read stdout directly.
		const text = stdout.trim();
		console.log(`[STT] Transcript: "${text}"`);
		return text.length > 0 ? text : null;
	} catch (error) {
		console.error("[STT] Transcription failed:", error);
		return null;
	} finally {
		await unlink(tmpWav).catch(() => null);
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
