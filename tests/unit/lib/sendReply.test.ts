import { container } from "@sapphire/framework";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capReply, postReply, whileTyping } from "../../../src/lib/autoresponder/sendReply.js";

function createMessage() {
	return {
		id: "m1",
		reply: vi.fn(async () => null),
		channel: { send: vi.fn(async () => null), sendTyping: vi.fn(async () => undefined) },
	};
}

describe("capReply", () => {
	it("leaves a reply of 1990 characters or fewer alone", () => {
		const text = "a".repeat(1990);

		expect(capReply(text)).toBe(text);
	});

	it("cuts a longer reply to 1990 characters, ending with an ellipsis", () => {
		const capped = capReply("a".repeat(3000));

		expect(capped).toHaveLength(1990);
		expect(capped.endsWith("a…")).toBe(true);
	});
});

describe("postReply", () => {
	beforeEach(() => {
		container.logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof container.logger;
	});

	it("replies to the message, or posts to the channel when there is nothing to reply to", async () => {
		const message = createMessage();

		await expect(postReply(message as never, "hi", true)).resolves.toBe(true);
		await expect(postReply(message as never, "yo", false)).resolves.toBe(true);

		expect(message.reply).toHaveBeenCalledExactlyOnceWith("hi");
		expect(message.channel.send).toHaveBeenCalledExactlyOnceWith("yo");
	});

	it("caps every reply, whichever way it is posted", async () => {
		const message = createMessage();

		await postReply(message as never, "x".repeat(2500), true);
		await postReply(message as never, "y".repeat(2500), false);

		const [[replied]] = message.reply.mock.calls as unknown as string[][];
		const [[sent]] = message.channel.send.mock.calls as unknown as string[][];
		expect(replied).toHaveLength(1990);
		expect(sent).toHaveLength(1990);
		expect(container.logger.warn).toHaveBeenCalledTimes(2);
	});

	it("reports false, without throwing, when Discord rejects the send", async () => {
		const message = createMessage();
		message.reply.mockRejectedValueOnce(new Error("Missing Permissions"));

		await expect(postReply(message as never, "hi", true)).resolves.toBe(false);
	});
});

describe("whileTyping", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("shows typing at once, refreshes it while the work runs, and stops afterwards", async () => {
		const message = createMessage();
		let finish: (value: string) => void = () => undefined;
		const work = new Promise<string>((resolve) => {
			finish = resolve;
		});

		const result = whileTyping(message as never, () => work);
		expect(message.channel.sendTyping).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(17_000);
		expect(message.channel.sendTyping).toHaveBeenCalledTimes(3);

		finish("done");
		await expect(result).resolves.toBe("done");
		await vi.advanceTimersByTimeAsync(20_000);
		expect(message.channel.sendTyping).toHaveBeenCalledTimes(3);
	});

	it("stops showing typing when the work throws", async () => {
		const message = createMessage();

		await expect(
			whileTyping(message as never, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		await vi.advanceTimersByTimeAsync(20_000);

		expect(message.channel.sendTyping).toHaveBeenCalledTimes(1);
	});
});
