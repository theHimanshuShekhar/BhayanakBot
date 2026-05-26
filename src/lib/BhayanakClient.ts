import { join } from "node:path";
import { LogLevel, SapphireClient } from "@sapphire/framework";
import { LoaderStrategy, Store } from "@sapphire/pieces";
import { GatewayIntentBits, Message, Partials } from "discord.js";
import { Player } from "discord-player";

class TypeScriptLoaderStrategy extends LoaderStrategy<any> {
	public constructor() {
		super();
		// tsx is not detected by @sapphire/pieces, so we explicitly add TypeScript extensions
		this.supportedExtensions.push(".ts", ".cts", ".mts");
	}
}

Store.defaultStrategy = new TypeScriptLoaderStrategy();

/** A Map that evicts the oldest entry once `maxSize` is reached. */
export class BoundedMap<K, V> extends Map<K, V> {
	constructor(private readonly maxSize: number) {
		super();
	}

	public override set(key: K, value: V): this {
		if (!this.has(key) && this.size >= this.maxSize) {
			this.delete(this.keys().next().value as K);
		}
		return super.set(key, value);
	}
}

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
	public readonly snipeCache = new BoundedMap<string, SnipedMessage>(1000);
	public readonly editSnipeCache = new BoundedMap<string, EditSnipedMessage>(1000);
	// Anti-raid: track recent joins per guild — bounded to avoid unbounded growth
	public readonly recentJoins = new BoundedMap<string, number[]>(1000);
	// Personality profile cache keyed by "userId:guildId"
	public readonly personalityCache = new BoundedMap<string, string>(500);
	// Guild personality/culture profile cache keyed by guildId
	public readonly guildPersonalityCache = new BoundedMap<string, string>(100);

	public constructor() {
		const valkeyUrl = new URL(process.env.VALKEY_URL ?? "redis://localhost:6379");
		const entrypoint = process.argv[1] ?? "";
		const baseUserDirectory = join(process.cwd(), entrypoint.includes("/dist/") ? "dist" : "src");
		super({
			rest: { timeout: 60_000 },
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
			tasks: {
				bull: {
					connection: {
						host: valkeyUrl.hostname,
						port: Number(valkeyUrl.port || 6379),
					},
				},
			},
		});

		this.player = new Player(this);
	}
}

declare module "@sapphire/framework" {
	interface SapphireClient {
		player: Player;
		snipeCache: BoundedMap<string, SnipedMessage>;
		editSnipeCache: BoundedMap<string, EditSnipedMessage>;
		recentJoins: Map<string, number[]>;
		personalityCache: BoundedMap<string, string>;
		guildPersonalityCache: BoundedMap<string, string>;
	}
}
