import { container } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPalworldPlayers, type PalworldPlayer } from "../../../src/lib/palworld.js";
import { SyncPalworldTrackerTask } from "../../../src/scheduled-tasks/syncPalworldTracker.js";

vi.mock("../../../src/lib/palworld.js", () => ({
	fetchPalworldPlayers: vi.fn(),
	isPalworldConfigured: vi.fn(() => true),
}));

const mockedFetchPalworldPlayers = vi.mocked(fetchPalworldPlayers);

function createTask(): SyncPalworldTrackerTask {
	return new SyncPalworldTrackerTask(
		{ store: {}, path: "syncPalworldTracker.ts", root: ".", name: "syncPalworldTracker" } as never,
		{},
	);
}

function createGuild() {
	const category = {
		type: ChannelType.GuildCategory,
		name: "Palworld — 1 online",
		children: { cache: new Map() },
		delete: vi.fn(),
	};
	const channels = {
		cache: [category],
		fetch: vi.fn().mockResolvedValue(undefined),
		create: vi.fn(),
	};
	const guild = {
		channels,
		roles: { everyone: { id: "everyone" }, fetch: vi.fn().mockResolvedValue(undefined) },
	};
	category.delete.mockImplementation(async () => {
		channels.cache.splice(0, 1);
	});
	return { category, guild };
}

function setContainerGuild(guild: ReturnType<typeof createGuild>["guild"]) {
	Object.assign(container, {
		logger: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
		client: {
			guilds: { fetch: vi.fn().mockResolvedValue(guild) },
		},
	});
}

const onlinePlayer: PalworldPlayer = {
	name: "Z1N1",
	accountName: "Athena",
	userId: "steam_76561198271516743",
	level: 80,
};

describe("SyncPalworldTrackerTask server states", () => {
	beforeEach(() => {
		vi.stubEnv("TARGET_GUILD_ID", "guild-1");
		mockedFetchPalworldPlayers.mockReset();
	});

	it("removes the category after two unavailable polls without throwing or retrying Discord work", async () => {
		const { category, guild } = createGuild();
		setContainerGuild(guild);
		mockedFetchPalworldPlayers.mockResolvedValue(null);

		const task = createTask();
		await expect(task.run()).resolves.toBeUndefined();
		await expect(task.run()).resolves.toBeUndefined();
		await expect(task.run()).resolves.toBeUndefined();

		expect(category.delete).toHaveBeenCalledTimes(1);
		expect(guild.channels.fetch).toHaveBeenCalledTimes(1);
		expect(guild.roles.fetch).toHaveBeenCalledTimes(1);
		expect(container.logger.warn).not.toHaveBeenCalled();
		expect(container.logger.info).toHaveBeenCalledTimes(1);
		expect(container.logger.info).toHaveBeenCalledWith(expect.stringContaining("unavailable"));
	});

	it("treats an empty player list as an unavailable server", async () => {
		const { category, guild } = createGuild();
		setContainerGuild(guild);
		mockedFetchPalworldPlayers.mockResolvedValue([]);

		const task = createTask();
		await task.run();
		await task.run();

		expect(category.delete).toHaveBeenCalledTimes(1);
	});

	it("recreates the category when a later poll finds players", async () => {
		const { guild } = createGuild();
		const restoredCategory = {
			type: ChannelType.GuildCategory,
			name: "Palworld — 1 online",
			id: "restored-category",
			children: { cache: new Map() },
			setName: vi.fn(),
		};
		guild.channels.create.mockResolvedValueOnce(restoredCategory).mockResolvedValueOnce({});
		setContainerGuild(guild);
		mockedFetchPalworldPlayers
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce([onlinePlayer]);

		const task = createTask();
		await task.run();
		await task.run();
		guild.channels.cache.splice(0, 1);
		await task.run();

		expect(guild.channels.create).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Palworld — 1 online", type: ChannelType.GuildCategory }),
		);
		expect(container.logger.info).toHaveBeenCalledWith(expect.stringContaining("available"));
	});
});
