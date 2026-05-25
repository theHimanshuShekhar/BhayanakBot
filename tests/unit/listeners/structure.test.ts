import { Listener } from "@sapphire/framework";
import { beforeAll, describe, expect, it } from "vitest";
import { createListenerContext, loadListenerClass, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

const listenerFiles = [
	"../../../src/listeners/guild/guildMemberAdd.js",
	"../../../src/listeners/guild/guildMemberRemove.js",
	"../../../src/listeners/guild/guildAuditLogEntryCreate.js",
	"../../../src/listeners/messages/messageCreate.js",
	"../../../src/listeners/messages/messageUpdate.js",
	"../../../src/listeners/messages/messageDelete.js",
	"../../../src/listeners/messages/randomResponder.js",
	"../../../src/listeners/messages/mentionResponder.js",
	"../../../src/listeners/reactions/messageReactionAdd.js",
	"../../../src/listeners/reactions/messageReactionRemove.js",
	"../../../src/listeners/voice/voiceStateUpdate.js",
];

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
