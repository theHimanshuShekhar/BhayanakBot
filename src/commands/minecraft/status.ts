import { Command } from "@sapphire/framework";
import { EmbedBuilder } from "discord.js";

const MC_SERVER_HOST = "mc.bhayanak.net";
const MC_STATUS_API = `https://api.mcstatus.io/v2/status/java/${MC_SERVER_HOST}`;
const MC_MAP_URL = "https://map.bhayanak.net";
const HOMESTEAD_VERSION = "1.3.6";

interface McStatusResponse {
	online: boolean;
	host: string;
	port: number;
	ip_address: string | null;
	eula_blocked: boolean;
	retrieved_at: number;
	expires_at: number;
	srv_record: string | null;
	version?: {
		name_clean: string;
		name_html: string;
		protocol: number;
	};
	players?: {
		online: number;
		max: number;
		list?: { name_clean: string; name_html: string; uuid: string }[];
	};
	motd?: {
		clean: string;
		html: string;
	};
	icon?: string;
}

interface ModEntry {
	name: string;
	url: string;
	summary: string;
}

const REQUIRED_MODS: ModEntry[] = [
	{
		name: `Homestead v${HOMESTEAD_VERSION}`,
		url: "https://www.curseforge.com/minecraft/modpacks/homestead-cozy",
		summary: `The modpack itself (version ${HOMESTEAD_VERSION}). Install from CurseForge or use your preferred launcher.`,
	},
];

const RECOMMENDED_MODS: ModEntry[] = [
	{
		name: "Distant Horizons",
		url: "https://modrinth.com/mod/distanthorizons",
		summary: "See farther without turning your game into a slideshow — adds LOD-based distant terrain rendering.",
	},
];

function stripMinecraftColorCodes(text: string): string {
	return text.replace(/§[0-9a-fklmnor]/g, "").trim();
}

function formatMotd(motd: { clean: string } | undefined): string {
	if (!motd?.clean) return "*No description*";
	return stripMinecraftColorCodes(motd.clean).slice(0, 1024) || "*No description*";
}

function formatPlayerList(list: { name_clean: string }[] | undefined): string {
	if (!list || list.length === 0) return "*No players online*";
	const names = list.map((p) => p.name_clean).slice(0, 30);
	let result = names.join(", ");
	if (list.length > 30) result += `, *+${list.length - 30} more*`;
	return result;
}

function formatModList(mods: ModEntry[]): string {
	return mods.map((mod) => `**[${mod.name}](${mod.url})**\n${mod.summary}`).join("\n\n");
}

export class MinecraftStatusCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			name: "minecraft",
			description: "Show the status of our Minecraft server and recommended mods",
			help: {
				summary: "Display Minecraft server status, online players, and recommended modlist.",
				examples: ["/minecraft"],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("minecraft").setDescription("Show the status of our Minecraft server and recommended mods"),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const embed = new EmbedBuilder().setTitle("⛏️ Bhayanak Minecraft — Homestead").setColor(0x3fb67b).setTimestamp();

		try {
			const response = await fetch(MC_STATUS_API);
			if (!response.ok) {
				throw new Error(`API responded with ${response.status}`);
			}
			const data = (await response.json()) as McStatusResponse;

			if (data.online) {
				embed
					.setColor(0x3fb67b)
					.setDescription(formatMotd(data.motd))
					.addFields(
						{
							name: "🔌 Status",
							value: "```🟢 Online```",
							inline: true,
						},
						{
							name: "🌐 IP Address",
							value: `\`${MC_SERVER_HOST}\``,
							inline: true,
						},
						{
							name: "📦 Version",
							value: data.version?.name_clean ? `\`${data.version.name_clean}\`` : "*Unknown*",
							inline: true,
						},
						{
							name: `👥 Players (${data.players?.online ?? 0}/${data.players?.max ?? "?"})`,
							value: formatPlayerList(data.players?.list),
						},
						{
							name: "🗺️ Live Map",
							value: `[${MC_MAP_URL.replace(/^https?:\/\//, "")}](${MC_MAP_URL})`,
						},
					);
			} else {
				embed
					.setColor(0xed4245)
					.setDescription("The server is currently offline.")
					.addFields(
						{
							name: "🔌 Status",
							value: "```🔴 Offline```",
							inline: true,
						},
						{
							name: "🌐 IP Address",
							value: `\`${MC_SERVER_HOST}\``,
							inline: true,
						},
					);
			}
		} catch (error) {
			this.container.logger.error("[Minecraft:Status] Failed to fetch server status:", error);
			embed
				.setColor(0xed4245)
				.setDescription("Could not reach the status API. The server may be offline or unreachable.")
				.addFields({
					name: "🌐 IP Address",
					value: `\`${MC_SERVER_HOST}\``,
				});
		}

		// --- Required Mods ---
		if (REQUIRED_MODS.length > 0) {
			embed.addFields({
				name: "📌 Required Mods",
				value: formatModList(REQUIRED_MODS),
			});
		}

		// --- Recommended Mods ---
		if (RECOMMENDED_MODS.length > 0) {
			embed.addFields({
				name: "📦 Recommended Mods",
				value: formatModList(RECOMMENDED_MODS),
			});
		}

		return interaction.editReply({ embeds: [embed] });
	}
}
