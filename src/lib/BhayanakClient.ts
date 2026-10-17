import { join } from "node:path";
import { LogLevel, SapphireClient } from "@sapphire/framework";
import { LoaderStrategy, Store } from "@sapphire/pieces";
import { GatewayIntentBits, Partials } from "discord.js";
import { Player } from "discord-player";
import { DEFAULT_ALLOWED_MENTIONS } from "./allowedMentions.js";
import { BoundedMap, ExpiringBoundedMap } from "./boundedMap.js";

class TypeScriptLoaderStrategy extends LoaderStrategy<any> {
	public constructor() {
		super();
		// tsx is not detected by @sapphire/pieces, so we explicitly add TypeScript extensions
		this.supportedExtensions.push(".ts", ".cts", ".mts");
	}
}

Store.defaultStrategy = new TypeScriptLoaderStrategy();

/** How long a deleted or edited message stays retrievable through /snipe and /editsnipe. */
export const SNIPE_TTL_MS = 10 * 60 * 1000;

export { BoundedMap, ExpiringBoundedMap };

export interface SnipedMessage {
	content: string;
	authorId: string;
	authorTag: string;
	authorAvatar: string | null;
	deletedAt: Date;
}

export interface EditSnipedMessage {
	oldContent: string;
	newContent: string;
	authorId: string;
	authorTag: string;
	authorAvatar: string | null;
	editedAt: Date;
}

export class BhayanakClient extends SapphireClient {
	public readonly player: Player;
	// In-memory caches keyed by channelId — bounded to avoid unbounded growth
	public readonly snipeCache = new ExpiringBoundedMap<string, SnipedMessage>(1000, SNIPE_TTL_MS, (m) => m.deletedAt);
	public readonly editSnipeCache = new ExpiringBoundedMap<string, EditSnipedMessage>(
		1000,
		SNIPE_TTL_MS,
		(m) => m.editedAt,
	);
	// Anti-raid: track recent joins per guild — bounded to avoid unbounded growth
	public readonly recentJoins = new BoundedMap<string, number[]>(1000);

	public constructor() {
		const entrypoint = process.argv[1] ?? "";
		const baseUserDirectory = join(process.cwd(), entrypoint.includes("/dist/") ? "dist" : "src");
		super({
			rest: { timeout: 60_000 },
			allowedMentions: DEFAULT_ALLOWED_MENTIONS,
			baseUserDirectory,
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.DirectMessages,
				GatewayIntentBits.GuildModeration,
			],
			partials: [Partials.Message, Partials.Channel, Partials.Reaction],
			logger: {
				level: process.env.NODE_ENV === "production" ? LogLevel.Info : LogLevel.Debug,
			},
			loadMessageCommandListeners: true,
		});

		this.player = new Player(this);
	}
}

declare module "@sapphire/framework" {
	interface SapphireClient {
		player: Player;
		snipeCache: ExpiringBoundedMap<string, SnipedMessage>;
		editSnipeCache: ExpiringBoundedMap<string, EditSnipedMessage>;
		recentJoins: Map<string, number[]>;
	}
}
