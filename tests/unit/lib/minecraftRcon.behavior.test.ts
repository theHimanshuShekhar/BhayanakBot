import { createServer, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { fetchMinecraftPlayers, isMinecraftRconConfigured } from "../../../src/lib/minecraftRcon.js";

function encodePacket(requestId: number, type: number, body: string): Buffer {
	const payload = Buffer.from(body, "utf8");
	const packet = Buffer.alloc(4 + 4 + 4 + payload.length + 2);
	packet.writeInt32LE(packet.length - 4, 0);
	packet.writeInt32LE(requestId, 4);
	packet.writeInt32LE(type, 8);
	payload.copy(packet, 12);
	return packet;
}

interface RconServer {
	port: number;
	close: () => Promise<void>;
}

async function startRconServer(response: string | string[], authenticate = true): Promise<RconServer> {
	const server = createServer((socket: Socket) => {
		let buffer = Buffer.alloc(0);
		socket.on("data", (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk]);
			while (buffer.length >= 4) {
				const packetLength = buffer.readInt32LE(0);
				if (buffer.length < packetLength + 4) return;
				const requestId = buffer.readInt32LE(4);
				const type = buffer.readInt32LE(8);
				buffer = buffer.subarray(packetLength + 4);
				if (type === 3) {
					socket.write(encodePacket(authenticate ? requestId : -1, 2, ""));
				} else if (type === 2 && authenticate) {
					for (const part of Array.isArray(response) ? response : [response]) {
						socket.write(encodePacket(requestId, 0, part));
					}
				}
			}
		});
	});

	const { promise: listening, resolve: resolveListening } = Promise.withResolvers<void>();
	server.listen(0, "127.0.0.1", resolveListening);
	await listening;
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("RCON test server did not expose a port");

	return {
		port: address.port,
		close: () => {
			const { promise, resolve, reject } = Promise.withResolvers<void>();
			server.close((error) => (error ? reject(error) : resolve()));
			return promise;
		},
	};
}
describe("Minecraft RCON client", () => {
	let server: RconServer | undefined;
	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	it("requires an RCON password", () => {
		expect(isMinecraftRconConfigured({})).toBe(false);
		expect(isMinecraftRconConfigured({ MINECRAFT_RCON_PASSWORD: " secret " })).toBe(true);
	});

	it("authenticates and returns the live Minecraft roster", async () => {
		server = await startRconServer("There are 2 of a max of 20 players online: Athena, Z1N1");

		await expect(
			fetchMinecraftPlayers({
				MINECRAFT_RCON_HOST: "127.0.0.1",
				MINECRAFT_RCON_PORT: String(server.port),
				MINECRAFT_RCON_PASSWORD: "secret",
			}),
		).resolves.toEqual([{ name: "Athena" }, { name: "Z1N1" }]);
	});
	it("assembles a roster split across multiple RCON response packets", async () => {
		server = await startRconServer(["There are 2 of a max of 20 players online: Athena,", " Z1N1"]);

		await expect(
			fetchMinecraftPlayers({
				MINECRAFT_RCON_HOST: "127.0.0.1",
				MINECRAFT_RCON_PORT: String(server.port),
				MINECRAFT_RCON_PASSWORD: "secret",
			}),
		).resolves.toEqual([{ name: "Athena" }, { name: "Z1N1" }]);
	});

	it("returns an unavailable result when RCON authentication fails", async () => {
		server = await startRconServer("ignored", false);

		await expect(
			fetchMinecraftPlayers({
				MINECRAFT_RCON_HOST: "127.0.0.1",
				MINECRAFT_RCON_PORT: String(server.port),
				MINECRAFT_RCON_PASSWORD: "wrong",
			}),
		).resolves.toBeNull();
	});
});
