import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		// vi.stubGlobal (e.g. fetch) and vi.stubEnv are undone after every test, even when an assertion throws first.
		unstubGlobals: true,
		unstubEnvs: true,
		environment: "node",
		exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**", "**/.claude/worktrees/**"],
		globalSetup: "./tests/setup/globalSetup.ts",
	},
	resolve: {
		alias: {
			"#": path.resolve(__dirname, "./src"),
		},
	},
});
