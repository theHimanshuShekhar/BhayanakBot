import { container } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMinecraftPlayers, type MinecraftPlayer } from "../../../src/lib/minecraftRcon.js";
import { SyncMinecraftTrackerTask } from "../../../src/scheduled-tasks/syncMinecraftTracker.js";

vi.mock("../../../src/lib/minecraftRcon.js", () => ({
	fetchMinecraftPlayers: vi.fn(),
	isMinecraftRconConfigured: vi.fn(() => true),
}));

const mockedFetchMinecraftPlayers = vi.mocked(fetchMinecraftPlayers);

function createTask(): SyncMinecraftTrackerTask {
	return new SyncMinecraftTrackerTask(
		{ store: {}, path: "syncMinecraftTracker.ts", root: ".", name: "syncMinecraftTracker" } as never,
		{},
	);
}

function createGuild(withCategory = true) {
	const category = {
		type: ChannelType.GuildCategory,
		name: "Minecraft — 1 online",
		id: "minecraft-category",
		position: 0,
		children: { cache: new Map() },
		delete: vi.fn(),
		setName: vi.fn(),
		setPosition: vi.fn(),
	};
	const channels = {
		cache: withCategory ? [category] : [],
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

const onlinePlayer: MinecraftPlayer = { name: "Athena" };

describe("SyncMinecraftTrackerTask server states", () => {
	beforeEach(() => {
		vi.stubEnv("TARGET_GUILD_ID", "guild-1");
		mockedFetchMinecraftPlayers.mockReset();
	});

	it("removes the category after two unavailable polls without repeating Discord work", async () => {
		const { category, guild } = createGuild();
		setContainerGuild(guild);
		mockedFetchMinecraftPlayers.mockResolvedValue(null);

		const task = createTask();
		await task.run();
		await task.run();
		await task.run();

		expect(category.delete).toHaveBeenCalledTimes(1);
		expect(guild.channels.fetch).toHaveBeenCalledTimes(1);
	});

	it("recreates the category and player channel after a later successful poll", async () => {
		const { guild } = createGuild(false);
		const restoredCategory = {
			type: ChannelType.GuildCategory,
			name: "Minecraft — 1 online",
			id: "restored-category",
			children: { cache: new Map() },
			setName: vi.fn(),
		};
		guild.channels.create.mockResolvedValueOnce(restoredCategory).mockResolvedValueOnce({});
		setContainerGuild(guild);
		mockedFetchMinecraftPlayers
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce([onlinePlayer]);

		const task = createTask();
		await task.run();
		await task.run();
		await task.run();

		expect(guild.channels.create).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ name: "Minecraft — 1 online", type: ChannelType.GuildCategory }),
		);
		expect(guild.channels.create).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ name: "Athena", parent: "restored-category", topic: "Athena" }),
		);
	});
	it("does not take ownership of an unrelated Minecraft category", async () => {
		const { category, guild } = createGuild();
		category.name = "Minecraft Builds";
		const trackerCategory = {
			type: ChannelType.GuildCategory,
			name: "Minecraft — 1 online",
			id: "tracker-category",
			children: { cache: new Map() },
			setName: vi.fn(),
		};
		guild.channels.create.mockResolvedValueOnce(trackerCategory).mockResolvedValueOnce({});
		setContainerGuild(guild);
		mockedFetchMinecraftPlayers.mockResolvedValue([onlinePlayer]);

		await createTask().run();

		expect(category.delete).not.toHaveBeenCalled();
		expect(guild.channels.create).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ name: "Minecraft — 1 online", type: ChannelType.GuildCategory }),
		);
	});
	it("creates the category at the top position below uncategorized channels", async () => {
		const { guild } = createGuild(false);
		guild.channels.create
			.mockResolvedValueOnce({
				type: ChannelType.GuildCategory,
				name: "Minecraft — 1 online",
				id: "restored-category",
				position: 0,
				children: { cache: new Map() },
				setName: vi.fn(),
				setPosition: vi.fn(),
			})
			.mockResolvedValueOnce({});
		setContainerGuild(guild);
		mockedFetchMinecraftPlayers.mockResolvedValue([onlinePlayer]);

		await createTask().run();

		expect(guild.channels.create).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ name: "Minecraft — 1 online", type: ChannelType.GuildCategory, position: 0 }),
		);
	});

	it("moves an existing category back to the top", async () => {
		const { category, guild } = createGuild();
		category.position = 5;
		setContainerGuild(guild);
		mockedFetchMinecraftPlayers.mockResolvedValue([onlinePlayer]);

		await createTask().run();

		expect(category.setPosition).toHaveBeenCalledWith(0, expect.objectContaining({ reason: expect.any(String) }));
	});
});
