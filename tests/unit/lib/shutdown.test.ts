import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "../../../src/lib/shutdown.js";

function createLogger() {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("createShutdown", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs every step in order and then exits with the given code", async () => {
		const order: string[] = [];
		const exit = vi.fn();
		const shutdown = createShutdown({
			logger: createLogger(),
			forceExitMs: 10_000,
			exit,
			steps: [
				{ name: "a", run: () => void order.push("a") },
				{ name: "b", run: async () => void order.push("b") },
			],
		});

		await shutdown("SIGTERM", 0);

		expect(order).toEqual(["a", "b"]);
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it("exits non-zero for a crash", async () => {
		const exit = vi.fn();
		const shutdown = createShutdown({ logger: createLogger(), forceExitMs: 10_000, exit, steps: [] });

		await shutdown("uncaught exception", 1);

		expect(exit).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("keeps going when a step throws or rejects, and logs it", async () => {
		const after = vi.fn();
		const logger = createLogger();
		const exit = vi.fn();
		const shutdown = createShutdown({
			logger,
			forceExitMs: 10_000,
			exit,
			steps: [
				{
					name: "sync",
					run: () => {
						throw new Error("sync boom");
					},
				},
				{ name: "async", run: () => Promise.reject(new Error("async boom")) },
				{ name: "after", run: after },
			],
		});

		await shutdown("SIGINT", 0);

		expect(after).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledTimes(2);
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it("runs the steps once when called repeatedly", async () => {
		const step = vi.fn();
		const exit = vi.fn();
		const logger = createLogger();
		const shutdown = createShutdown({ logger, forceExitMs: 10_000, exit, steps: [{ name: "s", run: step }] });

		await Promise.all([shutdown("SIGTERM", 0), shutdown("SIGINT", 0)]);
		await shutdown("SIGTERM", 0);

		expect(step).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledTimes(2);
	});

	it("does not hide a crash that happens during a graceful shutdown", async () => {
		let release: () => void = () => {};
		const exit = vi.fn();
		const shutdown = createShutdown({
			logger: createLogger(),
			forceExitMs: 10_000,
			exit,
			steps: [{ name: "slow", run: () => new Promise<void>((resolve) => (release = resolve)) }],
		});

		const first = shutdown("SIGTERM", 0);
		void shutdown("uncaught exception", 1);
		release();
		await first;

		expect(exit).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("forces exit when a step hangs", async () => {
		const exit = vi.fn();
		const logger = createLogger();
		const shutdown = createShutdown({
			logger,
			forceExitMs: 10_000,
			exit,
			steps: [{ name: "hang", run: () => new Promise<void>(() => {}) }],
		});

		void shutdown("SIGTERM", 0);
		await vi.advanceTimersByTimeAsync(9_999);
		expect(exit).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(exit).toHaveBeenCalledExactlyOnceWith(1);
		expect(logger.error).toHaveBeenCalled();
	});

	it("unrefs the force-exit timer so it cannot keep the process alive", async () => {
		const unref = vi.fn();
		const realSetTimeout = globalThis.setTimeout;
		const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms: number) => {
			const timer = realSetTimeout(fn, ms);
			timer.unref = () => {
				unref();
				return timer;
			};
			return timer;
		}) as unknown as typeof setTimeout);

		await createShutdown({ logger: createLogger(), forceExitMs: 10_000, exit: vi.fn(), steps: [] })("SIGTERM", 0);

		expect(unref).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});
});
