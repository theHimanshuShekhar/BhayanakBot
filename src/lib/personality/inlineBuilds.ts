// Inline profile builds are fire-and-forget from the message listener. Tracking them lets
// tests (and shutdown code) wait for builds that are still running instead of racing them.
const inlineBuilds = new Set<Promise<unknown>>();

export function trackInlineBuild<T>(build: Promise<T>): Promise<T> {
	inlineBuilds.add(build);
	const forget = () => {
		inlineBuilds.delete(build);
	};
	build.then(forget, forget);
	return build;
}

/** Resolves once every inline build started so far (and any they chain into) has settled. */
export async function settleInlineBuilds(): Promise<void> {
	while (inlineBuilds.size > 0) await Promise.allSettled([...inlineBuilds]);
}
