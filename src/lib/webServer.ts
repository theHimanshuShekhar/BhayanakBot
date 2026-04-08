import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

export function startWebServer(): void {
	const port = parseInt(process.env.WEB_PORT ?? "3000", 10);
	const distDir = join(process.cwd(), "web", "dist");

	const app = new Hono();

	// Serve static assets
	app.use("/*", serveStatic({ root: distDir }));

	// SPA fallback — unknown routes serve index.html so React Router handles them
	app.notFound((c) => {
		const html = readFileSync(join(distDir, "index.html"), "utf-8");
		return c.html(html);
	});

	serve({ fetch: app.fetch, port });
	console.log(`[web] Server running at http://localhost:${port}`);
}
