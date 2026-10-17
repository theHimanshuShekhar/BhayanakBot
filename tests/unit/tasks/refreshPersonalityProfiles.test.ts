import { container } from "@sapphire/framework";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";
import { getTasks } from "../../../src/tasks/index.js";
import { refreshPersonalityProfiles } from "../../../src/tasks/refreshPersonalityProfiles.js";

const due = vi.hoisted(() => ({
	getGuildsDueForPersonalityBuild: vi.fn(),
	getUsersDueForPersonalityBuild: vi.fn(),
}));

vi.mock("../../../src/db/queries/personalityTraining.js", () => due);
vi.mock("../../../src/lib/personality/buildProfile.js", () => ({
	buildPersonalityProfile: vi.fn(async () => ({ status: "built" })),
	INITIAL_USER_PROFILE_THRESHOLD: 100,
	REFRESH_USER_PROFILE_THRESHOLD: 20,
}));
vi.mock("../../../src/lib/personality/buildGuildProfile.js", () => ({
	buildGuildPersonalityProfile: vi.fn(async () => ({ status: "built" })),
	INITIAL_GUILD_PROFILE_THRESHOLD: 200,
	REFRESH_GUILD_PROFILE_THRESHOLD: 40,
}));

const mockedBuildUser = vi.mocked(buildPersonalityProfile);
const mockedBuildGuild = vi.mocked(buildGuildPersonalityProfile);

describe("refreshPersonalityProfiles task", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedBuildUser.mockImplementation(async () => ({ status: "built" }));
		mockedBuildGuild.mockImplementation(async () => ({ status: "built" }));
		due.getGuildsDueForPersonalityBuild.mockResolvedValue([]);
		due.getUsersDueForPersonalityBuild.mockResolvedValue([]);
		(container as any).logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
	});

	it("is always on: listed every 6 hours and once at startup", () => {
		expect(refreshPersonalityProfiles).toMatchObject({ intervalMs: 6 * 60 * 60 * 1000, runOnStartup: true });
		expect(getTasks().map((task) => task.name)).toContain("refreshPersonalityProfiles");
	});

	it("selects due profiles with the initial and refresh thresholds", async () => {
		await refreshPersonalityProfiles.run();

		expect(due.getUsersDueForPersonalityBuild).toHaveBeenCalledWith({ initial: 100, refresh: 20 });
		expect(due.getGuildsDueForPersonalityBuild).toHaveBeenCalledWith({ initial: 200, refresh: 40 });
	});

	it("builds nothing when nothing is due", async () => {
		await refreshPersonalityProfiles.run();

		expect(mockedBuildUser).not.toHaveBeenCalled();
		expect(mockedBuildGuild).not.toHaveBeenCalled();
	});

	it("builds every due server and member profile, one at a time, and logs the counts", async () => {
		due.getGuildsDueForPersonalityBuild.mockResolvedValue(["g1", "g2"]);
		due.getUsersDueForPersonalityBuild.mockResolvedValue([
			{ userId: "u1", guildId: "g1" },
			{ userId: "u2", guildId: "g1" },
			{ userId: "u3", guildId: "g2" },
		]);
		let running = 0;
		let maxRunning = 0;
		const slowBuild = async () => {
			running++;
			maxRunning = Math.max(maxRunning, running);
			await new Promise((resolve) => setTimeout(resolve, 1));
			running--;
			return { status: "built" as const };
		};
		mockedBuildUser.mockImplementation(slowBuild);
		mockedBuildGuild.mockImplementation(slowBuild);

		await refreshPersonalityProfiles.run();

		expect(mockedBuildGuild.mock.calls).toEqual([["g1"], ["g2"]]);
		expect(mockedBuildUser.mock.calls).toEqual([
			["u1", "g1"],
			["u2", "g1"],
			["u3", "g2"],
		]);
		expect(maxRunning).toBe(1);
		const summary = vi
			.mocked(container.logger.info)
			.mock.calls.map((call) => String(call[0]))
			.find((line) => line.includes("scheduled builds done"));
		expect(summary).toContain("servers built=2 skipped=0 failed=0");
		expect(summary).toContain("members built=3 skipped=0 failed=0");
	});

	it("counts skipped builds and keeps going after a failed build", async () => {
		due.getGuildsDueForPersonalityBuild.mockResolvedValue(["g1"]);
		due.getUsersDueForPersonalityBuild.mockResolvedValue([
			{ userId: "u1", guildId: "g1" },
			{ userId: "u2", guildId: "g1" },
			{ userId: "u3", guildId: "g1" },
		]);
		mockedBuildGuild.mockRejectedValueOnce(new Error("guild boom"));
		mockedBuildUser
			.mockRejectedValueOnce(new Error("user boom"))
			.mockResolvedValueOnce({ status: "skipped_cooldown" })
			.mockResolvedValueOnce({ status: "built" });

		await refreshPersonalityProfiles.run();

		expect(mockedBuildUser).toHaveBeenCalledTimes(3);
		expect(container.logger.error).toHaveBeenCalledTimes(2);
		const summary = vi
			.mocked(container.logger.info)
			.mock.calls.map((call) => String(call[0]))
			.find((line) => line.includes("scheduled builds done"));
		expect(summary).toContain("servers built=0 skipped=0 failed=1");
		expect(summary).toContain("members built=1 skipped=1 failed=1");
	});
});
