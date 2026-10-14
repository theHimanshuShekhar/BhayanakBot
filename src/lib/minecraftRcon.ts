import { createConnection } from "node:net";

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RCON_HOST = "127.0.0.1";
const DEFAULT_RCON_PORT = 25575;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const MIN_PACKET_LENGTH = 10;
const MAX_PACKET_LENGTH = 1_048_576;

export interface MinecraftPlayer {
	name: string;
}

export function isMinecraftRconConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.MINECRAFT_RCON_PASSWORD?.trim());
}

/** Parses the vanilla Java server's response to the RCON `list` command. */
export function parseMinecraftRconList(response: string): string[] | null {
	const normalized = response
		.replace(/§[0-9a-fklmnor]/gi, "")
		.replace(/\s+/g, " ")
		.trim();
	const match =
		/^There are\s+(\d+)\s+of\s+(?:a\s+)?max(?:imum)?(?:\s+of)?\s+\d+\s+players?\s+online(?:\s*:\s*(.*))?$/i.exec(
			normalized,
		);
	if (!match) return null;

	const onlineCount = Number(match[1]);
	if (onlineCount === 0) return [];

	const names = (match[2] ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	return names.length > 0 ? names : null;
}

interface RconPacket {
	requestId: number;
	type: number;
	body: string;
}

function encodePacket(requestId: number, type: number, body: string): Buffer<ArrayBufferLike> {
	const payload = Buffer.from(body, "utf8");
	const packet = Buffer.alloc(4 + 4 + 4 + payload.length + 2);
	packet.writeInt32LE(packet.length - 4, 0);
	packet.writeInt32LE(requestId, 4);
	packet.writeInt32LE(type, 8);
	payload.copy(packet, 12);
	return packet;
}

function decodePackets(buffer: Buffer<ArrayBufferLike>): {
	packets: RconPacket[];
	remaining: Buffer<ArrayBufferLike>;
} {
	const packets: RconPacket[] = [];
	let offset = 0;

	while (buffer.length - offset >= 4) {
		const packetLength = buffer.readInt32LE(offset);
		if (packetLength < MIN_PACKET_LENGTH || packetLength > MAX_PACKET_LENGTH) {
			throw new Error("Invalid RCON packet length");
		}
		if (buffer.length - offset < packetLength + 4) break;

		const packetStart = offset + 4;
		const packetEnd = packetStart + packetLength;
		packets.push({
			requestId: buffer.readInt32LE(packetStart),
			type: buffer.readInt32LE(packetStart + 4),
			body: buffer.subarray(packetStart + 8, packetEnd - 2).toString("utf8"),
		});
		offset = packetEnd;
	}

	return { packets, remaining: buffer.subarray(offset) };
}

function executeRconCommand(host: string, port: number, password: string, command: string): Promise<string | null> {
	return new Promise<string | null>((resolve) => {
		const socket = createConnection({ host, port });
		const authRequestId = 1;
		const commandRequestId = 2;
		const sentinelRequestId = 3;
		let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
		let commandResponse = "";
		let authenticated = false;
		let settled = false;

		const finish = (response: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			socket.destroy();
			resolve(response);
		};

		const timeout = setTimeout(() => finish(null), REQUEST_TIMEOUT_MS);
		socket.setTimeout(REQUEST_TIMEOUT_MS, () => finish(null));
		socket.on("error", () => finish(null));
		socket.on("data", (chunk: Buffer<ArrayBufferLike>) => {
			buffer = Buffer.concat([buffer, chunk]);
			try {
				const decoded = decodePackets(buffer);
				buffer = decoded.remaining;
				for (const packet of decoded.packets) {
					if (!authenticated) {
						if (packet.requestId !== authRequestId || packet.type !== SERVERDATA_AUTH_RESPONSE) {
							finish(null);
							return;
						}
						authenticated = true;
						socket.write(encodePacket(commandRequestId, SERVERDATA_EXECCOMMAND, command));
						// A second read-only command marks the end of the first command's
						// response, including any packets used for a large roster.
						socket.write(encodePacket(sentinelRequestId, SERVERDATA_EXECCOMMAND, command));
					} else if (packet.requestId === commandRequestId) {
						commandResponse += packet.body;
					} else if (packet.requestId === sentinelRequestId) {
						finish(commandResponse);
						return;
					}
				}
			} catch {
				finish(null);
			}
		});
		socket.once("connect", () => {
			socket.write(encodePacket(authRequestId, SERVERDATA_AUTH, password));
		});
	});
}

export async function fetchMinecraftPlayers(env: NodeJS.ProcessEnv = process.env): Promise<MinecraftPlayer[] | null> {
	try {
		const password = env.MINECRAFT_RCON_PASSWORD?.trim();
		if (!password) return null;

		const host = env.MINECRAFT_RCON_HOST?.trim() || DEFAULT_RCON_HOST;
		const configuredPort = env.MINECRAFT_RCON_PORT?.trim();
		const port = configuredPort ? Number(configuredPort) : DEFAULT_RCON_PORT;
		if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;

		const response = await executeRconCommand(host, port, password, "list");
		const names = response === null ? null : parseMinecraftRconList(response);
		return names?.map((name) => ({ name })) ?? null;
	} catch {
		return null;
	}
}
