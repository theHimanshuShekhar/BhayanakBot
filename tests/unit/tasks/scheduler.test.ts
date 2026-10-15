import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskScheduler, type TaskDefinition } from "../../../src/tasks/scheduler.js";

function createLogger() {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function task(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
	return { name: "demo", intervalMs: 1_000, runOnStartup: true, run: vi.fn(async () => {}), ...overrides };
}

describe("createTaskScheduler", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs startup tasks once on start and skips tasks that are not startup tasks", async () => {
		const startup = task({ name: "startup" });
		const intervalOnly = task({ name: "intervalOnly", runOnStartup: false });
		const scheduler = createTaskScheduler([startup, intervalOnly], createLogger());

		scheduler.start();
		await vi.advanceTimersByTimeAsync(0);

		expect(startup.run).toHaveBeenCalledTimes(1);
		expect(intervalOnly.run).not.toHaveBeenCalled();
		scheduler.stop();
	});

	it("does not block start() on a slow startup task", () => {
		const slow = task({ run: vi.fn(() => new Promise<void>(() => {})) });
		const scheduler = createTaskScheduler([slow], createLogger());

		expect(() => scheduler.start()).not.toThrow();
		expect(slow.run).toHaveBeenCalledTimes(1);
		scheduler.stop();
	});

	it("runs each task at its own cadence", async () => {
		const fast = task({ name: "fast", intervalMs: 1_000, runOnStartup: false });
		const slow = task({ name: "slow", intervalMs: 5_000, runOnStartup: false });
		const scheduler = createTaskScheduler([fast, slow], createLogger());

		scheduler.start();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(fast.run).toHaveBeenCalledTimes(5);
		expect(slow.run).toHaveBeenCalledTimes(1);
		scheduler.stop();
	});

	it("schedules no timer for a task without an interval", async () => {
		const once = task({ intervalMs: undefined });
		const scheduler = createTaskScheduler([once], createLogger());

		scheduler.start();
		await vi.advanceTimersByTimeAsync(0);

		expect(once.run).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("never overlaps two runs of the same task, including the startup run", async () => {
		let release: () => void = () => {};
		const run = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
		const scheduler = createTaskScheduler([task({ run })], createLogger());

		scheduler.start();
		await vi.advanceTimersByTimeAsync(3_500);
		expect(run).toHaveBeenCalledTimes(1);

		release();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(run).toHaveBeenCalledTimes(2);
		scheduler.stop();
	});

	it("lets different tasks run concurrently", async () => {
		const never = () => new Promise<void>(() => {});
		const a = task({ name: "a", run: vi.fn(never) });
		const b = task({ name: "b", run: vi.fn(never) });
		const scheduler = createTaskScheduler([a, b], createLogger());

		scheduler.start();

		expect(a.run).toHaveBeenCalledTimes(1);
		expect(b.run).toHaveBeenCalledTimes(1);
		scheduler.stop();
	});

	it("logs a failing task and keeps running it on later ticks", async () => {
		const logger = createLogger();
		const failing = task({ name: "failing", run: vi.fn().mockRejectedValue(new Error("boom")) });
		const healthy = task({ name: "healthy" });
		const scheduler = createTaskScheduler([failing, healthy], logger);

		scheduler.start();
		await vi.advanceTimersByTimeAsync(2_000);

		expect(failing.run).toHaveBeenCalledTimes(3);
		expect(healthy.run).toHaveBeenCalledTimes(3);
		expect(logger.error).toHaveBeenCalledTimes(3);
		expect(logger.error.mock.calls[0]?.[0]).toContain("failing");
		scheduler.stop();
	});

	it("catches a task that throws synchronously", async () => {
		const logger = createLogger();
		const throwing = task({
			run: vi.fn(() => {
				throw new Error("sync boom");
			}),
		});
		const scheduler = createTaskScheduler([throwing], logger);

		scheduler.start();
		await vi.advanceTimersByTimeAsync(0);

		expect(logger.error).toHaveBeenCalledTimes(1);
		scheduler.stop();
	});

	it("stop() clears every timer so no further runs happen", async () => {
		const a = task({ name: "a" });
		const b = task({ name: "b", intervalMs: 2_000 });
		const scheduler = createTaskScheduler([a, b], createLogger());

		scheduler.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(vi.getTimerCount()).toBe(2);

		scheduler.stop();
		expect(vi.getTimerCount()).toBe(0);

		await vi.advanceTimersByTimeAsync(10_000);
		expect(a.run).toHaveBeenCalledTimes(1);
		expect(b.run).toHaveBeenCalledTimes(1);
	});

	it("does not double-schedule when start() is called twice", async () => {
		const demo = task({ runOnStartup: false });
		const scheduler = createTaskScheduler([demo], createLogger());

		scheduler.start();
		scheduler.start();
		await vi.advanceTimersByTimeAsync(1_000);

		expect(demo.run).toHaveBeenCalledTimes(1);
		scheduler.stop();
	});
});
