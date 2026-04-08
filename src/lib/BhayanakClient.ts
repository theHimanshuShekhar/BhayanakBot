import { LogLevel, SapphireClient } from "@sapphire/framework";
import { GatewayIntentBits, Message, Partials } from "discord.js";
import { Player } from "discord-player";

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
	// Anti-raid: track recent joins per guild
	public readonly recentJoins = new Map<string, number[]>();

	public constructor() {
		const valkeyUrl = new URL(process.env.VALKEY_URL ?? "redis://localhost:6379");
		super({
			// Increase REST timeout to 60s to accommodate long-running operations like portrait image generation.
			// This applies globally to ALL Discord REST calls (editReply, send, etc.).
			rest: { timeout: 60_000 },
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.DirectMessages,
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
	}
}
