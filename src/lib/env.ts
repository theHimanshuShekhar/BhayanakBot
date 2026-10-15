// A blank value (`FOO=` in .env, `${FOO:-}` in Compose) means "unset", never "set to empty".

/** The trimmed value of an environment variable, or `undefined` when it is unset or blank. */
export function optionalEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
	const value = env[name]?.trim();
	return value ? value : undefined;
}

/** The trimmed value of an environment variable, or `fallback` when it is unset or blank. */
export function envOr(name: string, fallback: string, env: NodeJS.ProcessEnv = process.env): string {
	return optionalEnv(name, env) ?? fallback;
}

/** An integer environment variable, or `fallback` when it is unset, blank, or not a number. */
export function envIntOr(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
	const value = Number.parseInt(optionalEnv(name, env) ?? "", 10);
	return Number.isNaN(value) ? fallback : value;
}
