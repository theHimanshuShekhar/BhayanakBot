/**
 * One-shot script to pre-generate portraits for all pet types.
 * Run with: npx tsx src/scripts/generatePetPortraits.ts
 *
 * Requires:
 *   - ASSET_CHANNEL_ID env var: Discord channel ID to upload images to
 *   - DISCORD_TOKEN env var: Bot token
 *   - SD_URL env var (optional, defaults to http://localhost:7860)
 *   - DATABASE_URL env var
 */
import "dotenv/config";
import { Client, GatewayIntentBits, AttachmentBuilder, type TextChannel } from "discord.js";
import { db } from "../lib/database.js";
import { petPortraits } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { PETS } from "../lib/rpg/catalogs/pets.js";
import { generateImage, buildPetPrompt } from "../lib/imageGen.js";

async function main() {
	const channelId = process.env.ASSET_CHANNEL_ID;
	if (!channelId) {
		console.error("ASSET_CHANNEL_ID env var is required");
		process.exit(1);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const client = new Client({ intents: [GatewayIntentBits.Guilds] } as any);
	await client.login(process.env.DISCORD_TOKEN);
	await new Promise<void>((resolve) => client.once("ready", () => resolve()));
	console.log(`Logged in as ${client.user?.tag}`);

	const channel = (await client.channels.fetch(channelId)) as TextChannel | null;
	if (!channel || !("send" in channel)) {
		console.error("Channel not found or not a text channel");
		client.destroy();
		process.exit(1);
	}

	const petIds = Object.keys(PETS);

	for (const petId of petIds) {
		// Check if portrait already exists
		const existing = await db.query.petPortraits.findFirst({ where: eq(petPortraits.petId, petId) });
		if (existing) {
			console.log(`[${petId}] Already has portrait — skipping`);
			continue;
		}

		console.log(`[${petId}] Generating portrait…`);
		const prompt = buildPetPrompt(petId);
		const imageBuffer = await generateImage(prompt);

		if (!imageBuffer) {
			console.error(`[${petId}] Generation failed — skipping`);
			continue;
		}

		const attachment = new AttachmentBuilder(imageBuffer, { name: `${petId}.png` });
		const message = await channel.send({ content: `Pet portrait: ${petId}`, files: [attachment] });
		const url = message.attachments.first()?.url;

		if (!url) {
			console.error(`[${petId}] Could not get attachment URL — skipping`);
			continue;
		}

		await db
			.insert(petPortraits)
			.values({ petId, imageUrl: url })
			.onConflictDoUpdate({ target: petPortraits.petId, set: { imageUrl: url, generatedAt: new Date() } });

		console.log(`[${petId}] Done: ${url}`);
	}

	console.log("All pets processed.");
	client.destroy();
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
