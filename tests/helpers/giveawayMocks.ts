import { vi } from "vitest";

/** A guild whose member list is exactly `memberIds`; `members.fetch({ user })` answers like Discord does. */
export function createGuild(memberIds: string[], id = "g1") {
	const members = new Set(memberIds);
	const channel = {
		isTextBased: () => true,
		send: vi.fn(async (_options: unknown) => ({})),
		messages: { fetch: vi.fn(async () => null) },
	};
	return {
		id,
		channel,
		members: {
			fetch: vi.fn(
				async ({ user }: { user: string[] }) => new Map(user.filter((u) => members.has(u)).map((u) => [u, {}])),
			),
		},
		channels: { fetch: vi.fn(async () => channel) },
	};
}

export function createGiveawayRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		messageId: "m1",
		channelId: "c1",
		guildId: "g1",
		prize: "Nitro",
		winnerCount: 1,
		ended: false,
		winners: [] as string[],
		entries: [] as string[],
		...overrides,
	};
}
