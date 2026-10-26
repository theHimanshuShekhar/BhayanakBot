import node from "@astrojs/node";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://bot.bhayanak.net",
	output: "server",
	adapter: node({ mode: "standalone" }),
	integrations: [mdx(), sitemap()],
	vite: {
		plugins: [tailwindcss()],
		// Bundle dependencies into web/dist/server so the Docker web image needs no node_modules.
		ssr: { noExternal: true },
	},
});
