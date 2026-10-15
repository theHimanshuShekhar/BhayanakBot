/** A background job. Durable state lives in Postgres; a task re-derives its work on every run. */
export interface TaskDefinition {
	name: string;
	/** Milliseconds between runs. Omit for a task that only runs once, at startup. */
	intervalMs?: number;
	runOnStartup: boolean;
	run(): Promise<void>;
}

export interface TaskLogger {
	debug(...values: unknown[]): void;
	info(...values: unknown[]): void;
	error(...values: unknown[]): void;
}

export interface TaskScheduler {
	/** Fires the startup pass without waiting for it, then arms every interval. */
	start(): void;
	/** Clears every interval. A run already in flight is left to finish. */
	stop(): void;
}

/** See docs/adr/0005-in-process-task-scheduling.md. The bot must stay a single instance. */
export function createTaskScheduler(tasks: readonly TaskDefinition[], logger: TaskLogger): TaskScheduler {
	const running = new Set<string>();
	let timers: NodeJS.Timeout[] = [];
	let started = false;

	// One guard per task name, shared by the startup run and every interval run.
	const execute = async (task: TaskDefinition, trigger: "startup" | "interval"): Promise<void> => {
		if (running.has(task.name)) {
			logger.debug(`[tasks] ${task.name} is still running — skipping ${trigger} run`);
			return;
		}
		running.add(task.name);
		const startedAt = Date.now();
		try {
			await task.run();
			if (trigger === "startup") logger.info(`[startup] Task ${task.name} completed in ${Date.now() - startedAt}ms`);
		} catch (err) {
			logger.error(`[tasks] ${task.name} (${trigger}) failed after ${Date.now() - startedAt}ms:`, err);
		} finally {
			running.delete(task.name);
		}
	};

	return {
		start() {
			if (started) return;
			started = true;
			for (const task of tasks) {
				if (task.runOnStartup) void execute(task, "startup");
				if (task.intervalMs !== undefined) {
					timers.push(setInterval(() => void execute(task, "interval"), task.intervalMs));
				}
			}
		},
		stop() {
			for (const timer of timers) clearInterval(timer);
			timers = [];
			started = false;
		},
	};
}
