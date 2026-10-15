import { PermissionFlagsBits } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreconditionContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

const findFirst = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/database.js", () => ({ db: { query: { guildSettings: { findFirst } } } }));

const MODERATOR_ROLE_ID = "role-mod";

function makeInteraction(held: bigint[], roleIds: string[] = []) {
	const member = {
		permissions: { has: (flag: bigint) => held.includes(PermissionFlagsBits.Administrator) || held.includes(flag) },
		roles: { cache: { has: (id: string) => roleIds.includes(id) } },
	};
	return {
		user: { id: "u1" },
		guild: { id: "g1", members: { fetch: vi.fn().mockResolvedValue(member) } },
	} as any;
}

describe("IsModerator precondition", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	beforeEach(() => {
		findFirst.mockReset();
		findFirst.mockResolvedValue({ moderatorRoleId: MODERATOR_ROLE_ID });
	});

	async function run(interaction: any, permission: bigint) {
		const { IsModeratorPrecondition } = await import("../../../src/preconditions/IsModerator.js");
		const instance = new IsModeratorPrecondition(createPreconditionContext("src/preconditions/IsModerator.ts"), {});
		return instance.chatInputRun(interaction, {} as any, { permission });
	}

	it("lets a member with the matching permission act without the moderator role", async () => {
		const result = await run(makeInteraction([PermissionFlagsBits.BanMembers]), PermissionFlagsBits.BanMembers);
		expect(result.isOk()).toBe(true);
	});

	it("refuses a member whose permission belongs to a different action", async () => {
		// ManageMessages used to make someone a moderator for everything, including bans.
		const manageMessages = [PermissionFlagsBits.ManageMessages];
		expect((await run(makeInteraction(manageMessages), PermissionFlagsBits.BanMembers)).isErr()).toBe(true);
		expect((await run(makeInteraction(manageMessages), PermissionFlagsBits.KickMembers)).isErr()).toBe(true);
		expect((await run(makeInteraction(manageMessages), PermissionFlagsBits.ModerateMembers)).isErr()).toBe(true);
		expect((await run(makeInteraction(manageMessages), PermissionFlagsBits.ManageMessages)).isOk()).toBe(true);
	});

	it("does not let ban rights stand in for the other actions", async () => {
		const banOnly = [PermissionFlagsBits.BanMembers];
		expect((await run(makeInteraction(banOnly), PermissionFlagsBits.KickMembers)).isErr()).toBe(true);
		expect((await run(makeInteraction(banOnly), PermissionFlagsBits.ManageMessages)).isErr()).toBe(true);
	});

	it("lets the moderator role perform every action", async () => {
		const interaction = () => makeInteraction([], [MODERATOR_ROLE_ID]);
		for (const permission of [
			PermissionFlagsBits.BanMembers,
			PermissionFlagsBits.KickMembers,
			PermissionFlagsBits.ModerateMembers,
			PermissionFlagsBits.ManageMessages,
		]) {
			expect((await run(interaction(), permission)).isOk()).toBe(true);
		}
	});

	it("lets Administrator perform every action", async () => {
		const result = await run(makeInteraction([PermissionFlagsBits.Administrator]), PermissionFlagsBits.BanMembers);
		expect(result.isOk()).toBe(true);
	});

	it("refuses a member with no relevant permission or role, with the denial message", async () => {
		const result = await run(makeInteraction([], ["other-role"]), PermissionFlagsBits.BanMembers);
		expect(result.isErr()).toBe(true);
		expect(result.unwrapErr().message).toBe("You need to be a moderator to use this command.");
	});

	it("refuses when the guild has no moderator role configured and no permission matches", async () => {
		findFirst.mockResolvedValue(undefined);
		const result = await run(makeInteraction([], [MODERATOR_ROLE_ID]), PermissionFlagsBits.KickMembers);
		expect(result.isErr()).toBe(true);
	});
});
