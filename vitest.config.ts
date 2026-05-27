import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
		globalSetup: "./tests/setup/globalSetup.ts",
	},
	resolve: {
		alias: {
			"#": path.resolve(__dirname, "./src"),
		},
	},
});
