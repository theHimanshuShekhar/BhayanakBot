import { once } from "node:events";
import type { Client } from "discord.js";

/** Tasks that read the guild cache must not run before the gateway has filled it. */
export async function waitForClientReady(client: Client): Promise<void> {
	if (!client.isReady()) await once(client, "clientReady");
}
