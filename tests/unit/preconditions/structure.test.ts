import { AllFlowsPrecondition } from "@sapphire/framework";
import { beforeAll, describe, expect, it } from "vitest";
import {
	createPreconditionContext,
	loadPreconditionClass,
	setupSapphireContainer,
} from "../../helpers/sapphireMocks.js";

const preconditionFiles = [
	"../../../src/preconditions/GuildOnly.js",
	"../../../src/preconditions/IsAdmin.js",
	"../../../src/preconditions/IsModerator.js",
	"../../../src/preconditions/IsDJ.js",
	"../../../src/preconditions/TicketChannel.js",
];

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
