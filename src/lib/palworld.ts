import { z } from "zod";

const REQUEST_TIMEOUT_MS = 10_000;

// The bot and the Palworld server share a host, so a bare install needs no URL.
// Note this does NOT hold inside Docker, where localhost is the container itself —
// deployments on the botnet bridge network must set PALWORLD_API_URL explicitly.
const DEFAULT_API_URL = "http://127.0.0.1:8212";

// Field names vary slightly across Palworld server builds, so only the fields the
// tracker actually depends on are required. Unknown/extra fields are ignored.
const playerSchema = z.object({
	name: z.string().default(""),
	accountName: z.string().default(""),
	userId: z.string().trim().min(1),
	level: z.coerce.number().int().nonnegative().default(0),
});

export type PalworldPlayer = z.infer<typeof playerSchema>;

/** Only the admin key is required — the API URL falls back to the local server. */
export function isPalworldConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.PALWORLD_ADMIN_KEY?.trim());
}

/**
 * Fetches the players currently connected to the Palworld server.
 * Returns `null` when the server cannot provide a usable player list.
 */
export async function fetchPalworldPlayers(env: NodeJS.ProcessEnv = process.env): Promise<PalworldPlayer[] | null> {
	try {
		const baseUrl = env.PALWORLD_API_URL?.trim() || DEFAULT_API_URL;
		const adminKey = env.PALWORLD_ADMIN_KEY?.trim();
		if (!adminKey) return null;

		const auth = Buffer.from(`admin:${adminKey}`).toString("base64");
		const res = await fetch(new URL("/v1/api/players", baseUrl), {
			headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});

		if (!res.ok) return null;

		const body = z.object({ players: z.array(z.unknown()) }).safeParse(await res.json());
		if (!body.success) return null;

		// Drop individual malformed players rather than failing the whole sweep — one bad
		// record must not look like an unreachable server and tear down the category.
		return body.data.players.flatMap((entry) => {
			const parsed = playerSchema.safeParse(entry);
			return parsed.success ? [parsed.data] : [];
		});
	} catch {
		return null;
	}
}
