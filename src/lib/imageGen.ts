import type { RpgStats } from "../db/queries/rpg.js";

const SD_URL = process.env.SD_URL ?? "http://localhost:7860";

export async function generateImage(prompt: string): Promise<Buffer | null> {
	try {
		const res = await fetch(`${SD_URL}/sdapi/v1/txt2img`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: AbortSignal.timeout(5 * 60_000), // 5-minute timeout for CPU generation
			body: JSON.stringify({
				prompt,
				negative_prompt: "ugly, blurry, low quality, deformed, nsfw",
				steps: 20,
				width: 128,
				height: 128,
				cfg_scale: 7,
			}),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { images?: string[] };
		const b64 = data.images?.[0];
		if (!b64) return null;
		return Buffer.from(b64, "base64");
	} catch {
		return null;
	}
}

export async function transformAvatar(imageBuffer: Buffer, prompt: string): Promise<Buffer | null> {
	const b64 = imageBuffer.toString("base64");
	try {
		const res = await fetch(`${SD_URL}/sdapi/v1/img2img`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: AbortSignal.timeout(5 * 60_000),
			body: JSON.stringify({
				init_images: [b64],
				prompt,
				negative_prompt: "ugly, blurry, low quality, deformed, nsfw, nude, explicit",
				steps: 20,
				width: 256,
				height: 256,
				denoising_strength: 0.75,
				cfg_scale: 7,
			}),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { images?: string[] };
		const img = data.images?.[0];
		if (!img) return null;
		return Buffer.from(img, "base64");
	} catch {
		return null;
	}
}

export function buildCharacterPrompt(stats: RpgStats, petType?: string): string {
	const archetype =
		stats.strength > stats.intelligence && stats.strength > stats.charisma
			? "warrior fighter, heavy armor, sword"
			: stats.intelligence > stats.charisma
				? "mage scholar, robes, staff"
				: "rogue bard, cloak, dagger";
	const petSuffix = petType ? `, accompanied by a ${petType}` : "";
	return `fantasy character portrait${petSuffix}, ${archetype}, detailed digital art, plain dark background, dramatic lighting`;
}

export function buildPetPrompt(petId: string): string {
	return `${petId} fantasy RPG companion, cute creature, digital art, plain background, high quality`;
}
