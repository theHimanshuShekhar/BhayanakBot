import { LogLevel, SapphireClient } from "@sapphire/framework";
import { GatewayIntentBits, Message, Partials } from "discord.js";
import { Player } from "discord-player";

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
	// In-memory caches keyed by channelId
	public readonly snipeCache = new Map<string, SnipedMessage>();
	public readonly editSnipeCache = new Map<string, EditSnipedMessage>();
	// Anti-raid: track recent joins per guild
	public readonly recentJoins = new Map<string, number[]>();

	public constructor() {
		const valkeyUrl = new URL(process.env.VALKEY_URL ?? "redis://localhost:6379");
		super({
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
		snipeCache: Map<string, SnipedMessage>;
		editSnipeCache: Map<string, EditSnipedMessage>;
		recentJoins: Map<string, number[]>;
	}
}
