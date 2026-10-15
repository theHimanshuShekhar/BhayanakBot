import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ALLOWED_MENTIONS, notifyOnly } from "../../../src/lib/allowedMentions.js";
import { BhayanakClient } from "../../../src/lib/BhayanakClient.js";
import { NOTIFIES_NOBODY, resolveAllowedMentions } from "../../helpers/allowedMentions.js";

describe("Mention Policy defaults", () => {
	let client: BhayanakClient | undefined;

	afterEach(async () => {
		await client?.destroy();
		client = undefined;
	});

	it("configures the bot client to parse no mentions and never reply-ping", () => {
		client = new BhayanakClient();

		expect(client.options.allowedMentions).toBe(DEFAULT_ALLOWED_MENTIONS);
		expect(resolveAllowedMentions("hi @everyone <@&1> <@2>")).toEqual(NOTIFIES_NOBODY);
	});

	it("notifyOnly allows just the given members, never mass or role mentions", () => {
		const resolved = resolveAllowedMentions({ allowedMentions: notifyOnly(["1", "2"]) });

		expect(resolved).toEqual({ parse: [], users: ["1", "2"], roles: [], replied_user: false });
	});
});
