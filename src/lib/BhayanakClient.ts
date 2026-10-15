import { join } from "node:path";
import { LogLevel, SapphireClient } from "@sapphire/framework";
import { LoaderStrategy, Store } from "@sapphire/pieces";
import { GatewayIntentBits, Partials } from "discord.js";
import { Player } from "discord-player";
import { DEFAULT_ALLOWED_MENTIONS } from "./allowedMentions.js";

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

/** How long a deleted or edited message stays retrievable through /snipe and /editsnipe. */
export const SNIPE_TTL_MS = 10 * 60 * 1000;

/**
 * A BoundedMap whose entries also expire `ttlMs` after the time `timestampOf` reports for them.
 * Expired entries are removed (not just hidden): on read, and from the oldest end on every write.
 */
export class ExpiringBoundedMap<K, V> extends BoundedMap<K, V> {
	constructor(
		maxSize: number,
		private readonly ttlMs: number,
		private readonly timestampOf: (value: V) => Date,
	) {
		super(maxSize);
	}

	public override get(key: K): V | undefined {
		const value = super.get(key);
		if (value !== undefined && this.isExpired(value)) {
			this.delete(key);
			return undefined;
		}
		return value;
	}

	public override set(key: K, value: V): this {
		// Re-insert so iteration order stays oldest-first, then drop whatever has aged out.
		this.delete(key);
		for (const [oldKey, oldValue] of this) {
			if (!this.isExpired(oldValue)) break;
			this.delete(oldKey);
		}
		return super.set(key, value);
	}

	private isExpired(value: V): boolean {
		return Date.now() - this.timestampOf(value).getTime() >= this.ttlMs;
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
	public readonly snipeCache = new ExpiringBoundedMap<string, SnipedMessage>(1000, SNIPE_TTL_MS, (m) => m.deletedAt);
	public readonly editSnipeCache = new ExpiringBoundedMap<string, EditSnipedMessage>(
		1000,
		SNIPE_TTL_MS,
		(m) => m.editedAt,
	);
	// Anti-raid: track recent joins per guild — bounded to avoid unbounded growth
	public readonly recentJoins = new BoundedMap<string, number[]>(1000);
	// Personality profile cache keyed by "userId:guildId"
	public readonly personalityCache = new BoundedMap<string, string>(500);
	// Guild personality/culture profile cache keyed by guildId
	public readonly guildPersonalityCache = new BoundedMap<string, string>(100);

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
		personalityCache: BoundedMap<string, string>;
		guildPersonalityCache: BoundedMap<string, string>;
	}
}
