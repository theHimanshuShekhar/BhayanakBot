import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AllFlowsPrecondition } from "@sapphire/framework";
import { beforeAll, describe, expect, it } from "vitest";
import {
	createPreconditionContext,
	loadPreconditionClass,
	setupSapphireContainer,
} from "../../helpers/sapphireMocks.js";

function discoverPreconditionFiles(): string[] {
	const root = fileURLToPath(new URL("../../../src/preconditions", import.meta.url));
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
				const rel = relative(root, fullPath).split(sep).join("/").replace(/\.ts$/, ".js");
				files.push(`../../../src/preconditions/${rel}`);
			}
		}
	};
	walk(root);
	return files.sort();
}

const preconditionFiles = discoverPreconditionFiles();

const expectedPreconditionNames: Record<string, string> = {
	"GuildOnly.js": "GuildOnly",
	"IsAdmin.js": "IsAdmin",
	"IsModerator.js": "IsModerator",
	"IsDJ.js": "IsDJ",
	"TicketChannel.js": "TicketChannel",
};

describe("precondition structure", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	for (const file of preconditionFiles) {
		const basename = file.split("/").pop() ?? file;
		const name = basename.replace(".js", "");

		it(`${name} exports an AllFlowsPrecondition subclass`, async () => {
			const PreconditionClass = await loadPreconditionClass(file);
			expect(PreconditionClass.prototype).toBeInstanceOf(AllFlowsPrecondition);
		});

		it(`${name} instantiates without errors`, async () => {
			const PreconditionClass = await loadPreconditionClass(file);
			const context = createPreconditionContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new PreconditionClass(context, {});
			expect(instance).toBeInstanceOf(AllFlowsPrecondition);
			expect(instance.name).toBe(expectedPreconditionNames[basename]);
		});

		it(`${name} has chatInputRun method`, async () => {
			const PreconditionClass = await loadPreconditionClass(file);
			expect(typeof PreconditionClass.prototype.chatInputRun).toBe("function");
		});
	}

	it("all precondition files are accounted for", () => {
		expect(preconditionFiles.length).toBeGreaterThan(0);
	});
});
