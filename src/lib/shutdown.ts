export interface ShutdownStep {
	name: string;
	run(): void | Promise<void>;
}

export interface ShutdownLogger {
	info(...values: unknown[]): void;
	warn(...values: unknown[]): void;
	error(...values: unknown[]): void;
}

export interface ShutdownOptions {
	/** Run in order. A step that throws is logged and the remaining steps still run. */
	steps: readonly ShutdownStep[];
	logger: ShutdownLogger;
	/** If the steps have not finished by then, the process exits anyway. */
	forceExitMs: number;
	exit(code: number): void;
}

export const FORCE_EXIT_MS = 10_000;

/**
 * Builds the one shutdown routine for the process. Calls after the first do not rerun the steps, but a
 * later non-zero exit code (a crash during a graceful stop) replaces a zero one so the crash is not hidden.
 */
export function createShutdown({ steps, logger, forceExitMs, exit }: ShutdownOptions) {
	let exitCode = 0;
	let inProgress: Promise<void> | undefined;

	return function shutdown(reason: string, code: number): Promise<void> {
		if (code !== 0) exitCode = code;
		if (inProgress) {
			logger.warn(`[shutdown] Already shutting down; ignoring "${reason}"`);
			return inProgress;
		}

		logger.info(`[shutdown] Shutting down: ${reason}`);
		// Unref'd so the timer alone never keeps a process that finished cleanly alive.
		setTimeout(() => {
			logger.error(`[shutdown] Steps did not finish within ${forceExitMs}ms; forcing exit`);
			exit(exitCode || 1);
		}, forceExitMs).unref();

		inProgress = (async () => {
			for (const step of steps) {
				try {
					await step.run();
				} catch (err) {
					logger.error(`[shutdown] Step "${step.name}" failed:`, err);
				}
			}
			exit(exitCode);
		})();
		return inProgress;
	};
}
