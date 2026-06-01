import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Listener } from "@sapphire/framework";
import { beforeAll, describe, expect, it } from "vitest";
import { createListenerContext, loadListenerClass, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

function discoverListenerFiles(): string[] {
	const root = fileURLToPath(new URL("../../../src/listeners", import.meta.url));
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
				const rel = relative(root, fullPath).split(sep).join("/").replace(/\.ts$/, ".js");
				files.push(`../../../src/listeners/${rel}`);
			}
		}
	};
	walk(root);
	return files.sort();
}

const listenerFiles = discoverListenerFiles();

describe("listener structure", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	for (const file of listenerFiles) {
		const name = file.split("/").pop()?.replace(".js", "") ?? file;

		it(`${name} exports a Listener subclass`, async () => {
			const ListenerClass = await loadListenerClass(file);
			expect(ListenerClass.prototype).toBeInstanceOf(Listener);
		});

		it(`${name} instantiates without errors`, async () => {
			const ListenerClass = await loadListenerClass(file);
			const context = createListenerContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new ListenerClass(context, {});
			expect(instance).toBeInstanceOf(Listener);
			expect(instance.name).toBeTruthy();
		});

		it(`${name} has a run method`, async () => {
			const ListenerClass = await loadListenerClass(file);
			expect(typeof ListenerClass.prototype.run).toBe("function");
		});
	}

	it("all listener files are accounted for", () => {
		expect(listenerFiles.length).toBeGreaterThan(0);
	});
});
