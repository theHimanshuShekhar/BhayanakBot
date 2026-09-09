import { ChannelType, type Client, type Guild } from "discord.js";
import { writeDashboardPresenceSnapshot } from "../db/queries/dashboardPresence.js";
import { TARGET_GUILD_ID } from "./constants.js";

export const DEFAULT_DASHBOARD_PRESENCE_INTERVAL_MS = 60 * 1000;
const WIDGET_TIMEOUT_MS = 10 * 1000;

export function getDashboardPresenceIntervalMs(env: Pick<NodeJS.ProcessEnv, "DASHBOARD_PRESENCE_INTERVAL_MS">): number {
	const value = Number(env.DASHBOARD_PRESENCE_INTERVAL_MS);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_DASHBOARD_PRESENCE_INTERVAL_MS;
}

export interface DashboardPresenceOccupant {
	userId: string;
	name: string;
	avatarUrl: string | null;
	isBot: boolean;
	mute: boolean;
	deaf: boolean;
	streaming: boolean;
}

export interface DashboardPresenceChannel {
	id: string;
	name: string;
	position: number;
	userLimit: number;
	occupants: DashboardPresenceOccupant[];
}

export interface DashboardPresenceMember {
	name: string;
	avatarUrl: string | null;
	status: string;
	isBot: boolean;
	channelId: string | null;
}

export interface DashboardPresencePayload {
	guild: {
		id: string;
		name: string | null;
		iconUrl: string | null;
		memberCount: number;
		presenceCount: number;
	};
	channels: DashboardPresenceChannel[];
	members: DashboardPresenceMember[];
	capturedAt: string;
}

/** Guild-side view of one member, adapted from discord.js. */
export interface PresenceGuildMemberView {
	userId: string;
	username: string;
	globalName: string | null;
	nickname: string | null;
	displayName: string;
	avatarUrl: string | null;
	isBot: boolean;
	voiceChannelId: string | null;
	mute: boolean;
	deaf: boolean;
	streaming: boolean;
}

export interface PresenceGuildView {
	id: string;
	name: string | null;
	iconUrl: string | null;
	memberCount: number;
	voiceChannels: { id: string; name: string; position: number; userLimit: number }[];
	members: PresenceGuildMemberView[];
}

export interface WidgetMemberView {
	name: string;
	avatarUrl: string | null;
	status: string;
	channelId: string | null;
}

export interface WidgetView {
	name: string | null;
	presenceCount: number;
	members: WidgetMemberView[];
}

function normalizeName(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * Match a widget display name to a guild member. Widget names are display
 * names or nicknames (they may contain spaces), never the unique username, so
 * the match runs case-insensitively across every name the member is known by.
 * An exact (case-sensitive) hit wins; a lone normalized hit is used as the
 * fallback; ambiguity resolves to unmatched so a person is never flagged with
 * another account's bot bit.
 */
export function matchGuildMember(
	widgetName: string,
	members: PresenceGuildMemberView[],
): PresenceGuildMemberView | null {
	const exact = members.filter((m) =>
		[m.username, m.globalName, m.nickname, m.displayName].some((known) => known === widgetName),
	);
	if (exact.length === 1) return exact[0];
	const normalized = normalizeName(widgetName);
	const fuzzy = members.filter((m) =>
		[m.username, m.globalName, m.nickname, m.displayName].some(
			(known) => known !== null && normalizeName(known) === normalized,
		),
	);
	if (exact.length === 0 && fuzzy.length === 1) return fuzzy[0];
	return null;
}

export function buildDashboardPresencePayload(
	guild: PresenceGuildView,
	widget: WidgetView,
	capturedAt = new Date(),
): DashboardPresencePayload {
	const occupantsByChannel = new Map<string, DashboardPresenceOccupant[]>();
	for (const member of guild.members) {
		if (member.voiceChannelId === null) continue;
		const list = occupantsByChannel.get(member.voiceChannelId) ?? [];
		list.push({
			userId: member.userId,
			name: member.displayName,
			avatarUrl: member.avatarUrl,
			isBot: member.isBot,
			mute: member.mute,
			deaf: member.deaf,
			streaming: member.streaming,
		});
		occupantsByChannel.set(member.voiceChannelId, list);
	}

	return {
		guild: {
			id: guild.id,
			name: guild.name,
			iconUrl: guild.iconUrl,
			memberCount: guild.memberCount,
			presenceCount: widget.presenceCount,
		},
		channels: guild.voiceChannels.map((channel) => ({
			...channel,
			occupants: occupantsByChannel.get(channel.id) ?? [],
		})),
		members: widget.members.map((member) => {
			const matched = matchGuildMember(member.name, guild.members);
			return {
				name: member.name,
				avatarUrl: matched?.avatarUrl ?? member.avatarUrl,
				status: member.status,
				// Fail open: an unmatched widget entry renders as human rather
				// than vanishing from the dashboard.
				isBot: matched?.isBot ?? false,
				channelId: matched?.voiceChannelId ?? member.channelId,
			};
		}),
		capturedAt: capturedAt.toISOString(),
	};
}

interface WidgetApiMember {
	username?: unknown;
	status?: unknown;
	avatar_url?: unknown;
	channel_id?: unknown;
}

interface WidgetApiResponse {
	name?: unknown;
	presence_count?: unknown;
	members?: unknown;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

export function parseWidgetView(payload: unknown): WidgetView {
	const root = (payload ?? {}) as WidgetApiResponse;
	const rawMembers = Array.isArray(root.members) ? root.members : [];
	return {
		name: asString(root.name),
		presenceCount: typeof root.presence_count === "number" ? root.presence_count : 0,
		members: (rawMembers as WidgetApiMember[]).flatMap((entry) => {
			const name = asString(entry.username);
			if (name === null) return [];
			return [
				{
					name,
					avatarUrl: asString(entry.avatar_url),
					status: asString(entry.status) ?? "offline",
					channelId: asString(entry.channel_id),
				},
			];
		}),
	};
}

export async function fetchWidgetView(guildId: string): Promise<WidgetView> {
	const res = await fetch(`https://discord.com/api/guilds/${guildId}/widget.json`, {
		signal: AbortSignal.timeout(WIDGET_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`widget.json responded with ${res.status}`);
	return parseWidgetView(await res.json());
}

function adaptGuildMember(member: {
	user: { id: string; username: string; globalName: string | null; bot: boolean; displayAvatarURL(): string | null };
	nickname: string | null;
	displayName: string;
}): Omit<PresenceGuildMemberView, "voiceChannelId" | "mute" | "deaf" | "streaming"> {
	return {
		userId: member.user.id,
		username: member.user.username,
		globalName: member.user.globalName,
		nickname: member.nickname,
		displayName: member.displayName,
		avatarUrl: member.user.displayAvatarURL(),
		isBot: member.user.bot,
	};
}

export function adaptGuildView(guild: Guild): PresenceGuildView {
	const voiceChannels = guild.channels.cache
		.filter((channel) => channel.type === ChannelType.GuildVoice)
		.map((channel) => {
			const voice = channel as unknown as {
				id: string;
				name: string;
				rawPosition: number;
				userLimit: number;
			};
			return { id: voice.id, name: voice.name, position: voice.rawPosition, userLimit: voice.userLimit };
		})
		.sort((a, b) => a.position - b.position);

	return {
		id: guild.id,
		name: guild.name,
		iconUrl: guild.iconURL(),
		memberCount: guild.memberCount,
		voiceChannels,
		members: guild.members.cache.map((member) => {
			const voice = guild.voiceStates.cache.get(member.id);
			return {
				...adaptGuildMember(member),
				voiceChannelId: voice?.channelId ?? null,
				mute: (voice?.mute ?? false) || (voice?.selfMute ?? false),
				deaf: (voice?.deaf ?? false) || (voice?.selfDeaf ?? false),
				streaming: voice?.streaming ?? false,
			};
		}),
	};
}

type SnapshotClient = Pick<Client, "guilds">;

export async function writeDashboardPresenceSnapshotForClient(client: SnapshotClient): Promise<void> {
	const guild = client.guilds.cache.get(TARGET_GUILD_ID);
	if (!guild) throw new Error(`target guild ${TARGET_GUILD_ID} is not in the client cache`);
	// Populate the member cache so bot flags and voice states are complete.
	await guild.members.fetch();
	const [widget] = await Promise.all([fetchWidgetView(guild.id)]);
	await writeDashboardPresenceSnapshot(buildDashboardPresencePayload(adaptGuildView(guild), widget));
}
