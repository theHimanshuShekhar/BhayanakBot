import { beforeEach, describe, expect, it, vi } from "vitest";
import { REMINDER_MAX_LENGTH, RemindCommand } from "../../../src/commands/utility/remind.js";
import { db } from "../../../src/lib/database.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

vi.mock("../../../src/db/queries/reminders.js", () => ({ markReminderSent: vi.fn() }));
vi.mock("../../../src/lib/database.js", () => ({ db: { insert: vi.fn() } }));

function setup(message: string) {
	const reply = vi.fn(async (_options: unknown) => null);
	const returning = vi.fn(async () => [{ id: 3 }]);
	vi.mocked(db.insert).mockReturnValue({ values: vi.fn(() => ({ returning })) } as never);
	const interaction = {
		options: { getString: (name: string) => (name === "time" ? "1h" : message) },
		user: { id: "u1" },
		channelId: "c1",
		guildId: "g1",
		reply,
	};
	const command = new RemindCommand(createCommandContext("src/commands/utility/remind.ts"), {});
	return { run: () => command.runSet(interaction as never), reply };
}

describe("/remind set message length", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSapphireContainer();
	});

	it("rejects an over-long message without saving a reminder", async () => {
		const { run, reply } = setup("x".repeat(REMINDER_MAX_LENGTH + 1));

		await run();

		expect(db.insert).not.toHaveBeenCalled();
		expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("1000") }));
	});

	it("accepts a message of exactly the maximum length", async () => {
		const { run } = setup("x".repeat(REMINDER_MAX_LENGTH));

		await run();

		expect(db.insert).toHaveBeenCalledTimes(1);
	});
});
