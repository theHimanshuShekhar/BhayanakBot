import { Subcommand } from "@sapphire/plugin-subcommands";
import { type ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { getTableColumns } from "drizzle-orm";
import {
	type GuildSettings,
	type GuildSettingsInsert,
	getOrCreateSettings,
	updateSettings,
} from "../../db/queries/guildSettings.js";
import { guildSettings } from "../../db/schema.js";
import { isTextChannelType, TEXT_CHANNEL_TYPES } from "../../lib/textChannels.js";

type SettingSpec =
	| { name: string; kind: "channel" | "role" | "text" | "boolean" }
	| { name: string; kind: "number"; min: number; max: number };

/**
 * The only guild_settings columns `/config set` and `/config reset` can touch, keyed by column. Anything absent
 * (guild_id, auto-mod and anti-raid columns, which have their own subcommands) is not user-configurable here.
 */
const SETTINGS = {
	welcomeChannelId: { name: "welcome-channel", kind: "channel" },
	goodbyeChannelId: { name: "goodbye-channel", kind: "channel" },
	logChannelId: { name: "log-channel", kind: "channel" },
	levelUpChannelId: { name: "level-up-channel", kind: "channel" },
	musicChannelId: { name: "music-channel", kind: "channel" },
	starboardChannelId: { name: "starboard-channel", kind: "channel" },
	autoRole: { name: "auto-role", kind: "role" },
	mutedRoleId: { name: "muted-role", kind: "role" },
	djRoleId: { name: "dj-role", kind: "role" },
	moderatorRoleId: { name: "moderator-role", kind: "role" },
	starThreshold: { name: "star-threshold", kind: "number", min: 1, max: 1000 },
	xpRate: { name: "xp-rate", kind: "number", min: 1, max: 1000 },
	xpCooldownSeconds: { name: "xp-cooldown", kind: "number", min: 1, max: 1000 },
	welcomeMessage: { name: "welcome-message", kind: "text" },
	goodbyeMessage: { name: "goodbye-message", kind: "text" },
	levelUpMessage: { name: "level-up-message", kind: "text" },
	personalityEnabled: { name: "personality-features", kind: "boolean" },
	randomResponseChannelId: { name: "random-response-channel", kind: "channel" },
	randomResponseChance: { name: "random-response-chance", kind: "number", min: 0, max: 100 },
} as const satisfies Partial<Record<keyof GuildSettings, SettingSpec>>;

type ConfigurableSetting = keyof typeof SETTINGS;

const SETTING_CHOICES = Object.entries(SETTINGS).map(([value, { name }]) => ({ name, value }));

function settingSpec(key: string): SettingSpec | undefined {
	return Object.hasOwn(SETTINGS, key) ? SETTINGS[key as ConfigurableSetting] : undefined;
}

/** What `/config reset` writes: the column's schema default, or null for settings that default to unset. */
export function resetValue(key: ConfigurableSetting): GuildSettingsInsert[ConfigurableSetting] {
	const column = getTableColumns(guildSettings)[key];
	return (column.hasDefault ? column.default : null) as GuildSettingsInsert[ConfigurableSetting];
}

type ConfigChange = { updates: Partial<GuildSettingsInsert>; summary: string } | { error: string };

/** Translates one `/config automod` request; never returns an empty update. */
export function autoModChange(setting: string, value: string | null, number: number | null): ConfigChange {
	switch (setting) {
		case "enable":
			return { updates: { autoModEnabled: true }, summary: "auto-mod enabled" };
		case "disable":
			return { updates: { autoModEnabled: false }, summary: "auto-mod disabled" };
		case "spamThreshold":
			if (number === null) return { error: "spam-threshold needs a `number`." };
			return { updates: { autoModSpamThreshold: number }, summary: `spam threshold set to ${number}` };
		case "maxMentions":
			if (number === null) return { error: "max-mentions needs a `number`." };
			return { updates: { autoModMaxMentions: number }, summary: `max mentions set to ${number}` };
		case "muteDuration":
			if (number === null) return { error: "mute-duration needs a `number` of minutes." };
			return { updates: { autoModMuteDuration: number * 60000 }, summary: `mute duration set to ${number} min` };
		case "badLinks":
			if (value !== "true" && value !== "false") return { error: "bad-links needs a `value` of true or false." };
			return {
				updates: { autoModBadLinks: value === "true" },
				summary: `bad link filtering ${value === "true" ? "enabled" : "disabled"}`,
			};
		case "action":
			if (value !== "warn" && value !== "mute" && value !== "kick")
				return { error: "action needs a `value` of warn, mute, or kick." };
			return { updates: { autoModAction: value }, summary: `action set to ${value}` };
		default:
			return { error: `Unknown auto-mod setting **${setting}**.` };
	}
}

/** Translates one `/config antiraid` request; never returns an empty update. */
export function antiRaidChange(setting: string, number: number | null): ConfigChange {
	switch (setting) {
		case "enable":
			return { updates: { antiRaidEnabled: true }, summary: "anti-raid enabled" };
		case "disable":
			return { updates: { antiRaidEnabled: false }, summary: "anti-raid disabled" };
		case "threshold":
			if (number === null) return { error: "threshold needs a `number`." };
			return { updates: { antiRaidJoinThreshold: number }, summary: `join threshold set to ${number}` };
		case "window":
			if (number === null) return { error: "window needs a `number` of seconds." };
			return { updates: { antiRaidJoinWindow: number }, summary: `join window set to ${number}s` };
		default:
			return { error: `Unknown anti-raid setting **${setting}**.` };
	}
}

export class ConfigCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			name: "config",
			description: "Configure BhayanakBot settings for this server",
			preconditions: ["GuildOnly", "IsAdmin"],
			help: {
				summary: "Configure server channels, roles, auto-moderation, and anti-raid settings.",
				usageNotes:
					"Staff commands are hidden from members without the matching permission (Manage Server for admin commands, Moderate Members for moderation). To show one to a moderator-role holder who lacks it, grant access in Server Settings > Integrations > BhayanakBot.",
				examples: [
					"/config view",
					"/config set setting:log-channel channel:#mod-log",
					"/config automod setting:spam-threshold number:5",
				],
				subcommands: {
					view: { summary: "View current server configuration.", examples: ["/config view"] },
					set: {
						summary: "Set a configuration value for a specific setting.",
						examples: ["/config set setting:log-channel channel:#mod-log"],
					},
					reset: {
						summary: "Clear a setting back to its default.",
						examples: ["/config reset setting:log-channel"],
					},
					automod: {
						summary: "Configure auto-moderation thresholds.",
						examples: ["/config automod setting:spam-threshold number:5"],
					},
					antiraid: {
						summary: "Configure anti-raid protection (join rate limits).",
						examples: ["/config antiraid setting:threshold number:10"],
					},
				},
			},
			subcommands: [
				{ name: "view", chatInputRun: "chatInputView" },
				{ name: "set", chatInputRun: "chatInputSet" },
				{ name: "reset", chatInputRun: "chatInputReset" },
				{ name: "automod", chatInputRun: "chatInputAutoMod" },
				{ name: "antiraid", chatInputRun: "chatInputAntiRaid" },
			],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("config")
				.setDescription("Configure BhayanakBot settings for this server")
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.addSubcommand((sub) => sub.setName("view").setDescription("View current server configuration"))
				.addSubcommand((sub) =>
					sub
						.setName("set")
						.setDescription("Set a configuration value")
						.addStringOption((opt) =>
							opt
								.setName("setting")
								.setDescription("The setting to configure")
								.setRequired(true)
								.addChoices(...SETTING_CHOICES),
						)
						.addChannelOption((opt) =>
							opt
								.setName("channel")
								.setDescription("Text or announcement channel to set")
								.addChannelTypes(...TEXT_CHANNEL_TYPES),
						)
						.addRoleOption((opt) => opt.setName("role").setDescription("Role to set"))
						.addIntegerOption((opt) =>
							opt.setName("number").setDescription("Number value").setMinValue(0).setMaxValue(1000),
						)
						.addStringOption((opt) => opt.setName("text").setDescription("Text value (for messages)"))
						.addBooleanOption((opt) => opt.setName("toggle").setDescription("Toggle a boolean setting on/off")),
				)
				.addSubcommand((sub) =>
					sub
						.setName("reset")
						.setDescription("Clear a setting back to its default")
						.addStringOption((opt) =>
							opt
								.setName("setting")
								.setDescription("The setting to clear")
								.setRequired(true)
								.addChoices(...SETTING_CHOICES),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("automod")
						.setDescription("Configure auto-moderation")
						.addStringOption((opt) =>
							opt
								.setName("setting")
								.setDescription("Auto-mod setting")
								.setRequired(true)
								.addChoices(
									{ name: "enable", value: "enable" },
									{ name: "disable", value: "disable" },
									{ name: "spam-threshold", value: "spamThreshold" },
									{ name: "bad-links", value: "badLinks" },
									{ name: "max-mentions", value: "maxMentions" },
									{ name: "action", value: "action" },
									{ name: "mute-duration", value: "muteDuration" },
								),
						)
						.addStringOption((opt) =>
							opt
								.setName("value")
								.setDescription("Value for the setting")
								.addChoices(
									{ name: "true", value: "true" },
									{ name: "false", value: "false" },
									{ name: "warn", value: "warn" },
									{ name: "mute", value: "mute" },
									{ name: "kick", value: "kick" },
								),
						)
						.addIntegerOption((opt) =>
							opt.setName("number").setDescription("Numeric value").setMinValue(1).setMaxValue(100),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("antiraid")
						.setDescription("Configure anti-raid protection")
						.addStringOption((opt) =>
							opt
								.setName("setting")
								.setDescription("Anti-raid setting")
								.setRequired(true)
								.addChoices(
									{ name: "enable", value: "enable" },
									{ name: "disable", value: "disable" },
									{ name: "threshold", value: "threshold" },
									{ name: "window", value: "window" },
								),
						)
						.addIntegerOption((opt) =>
							opt.setName("number").setDescription("Numeric value").setMinValue(1).setMaxValue(100),
						),
				),
		);
	}

	public async chatInputView(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const settings = await getOrCreateSettings(interaction.guildId!);

		const embed = new EmbedBuilder()
			.setTitle("⚙️ BhayanakBot Configuration")
			.setColor(0x5865f2)
			.addFields(
				{
					name: "Channels",
					value: [
						`Welcome: ${settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : "Not set"}`,
						`Goodbye: ${settings.goodbyeChannelId ? `<#${settings.goodbyeChannelId}>` : "Not set"}`,
						`Mod Log: ${settings.logChannelId ? `<#${settings.logChannelId}>` : "Not set"}`,
						`Level Up: ${settings.levelUpChannelId ? `<#${settings.levelUpChannelId}>` : "Not set"}`,
						`Music: ${settings.musicChannelId ? `<#${settings.musicChannelId}>` : "Any channel"}`,
						`Starboard: ${settings.starboardChannelId ? `<#${settings.starboardChannelId}>` : "Not set"}`,
					].join("\n"),
				},
				{
					name: "Roles",
					value: [
						`Auto Role: ${settings.autoRole ? `<@&${settings.autoRole}>` : "Not set"}`,
						`Muted: ${settings.mutedRoleId ? `<@&${settings.mutedRoleId}>` : "Not set"}`,
						`Moderator: ${settings.moderatorRoleId ? `<@&${settings.moderatorRoleId}>` : "Not set"}`,
						`DJ: ${settings.djRoleId ? `<@&${settings.djRoleId}>` : "Not set"}`,
					].join("\n"),
				},
				{
					name: "XP & Leveling",
					value: `XP Rate: ${settings.xpRate} | Cooldown: ${settings.xpCooldownSeconds}s`,
				},
				{
					name: "Auto-Mod",
					value: [
						`Enabled: ${settings.autoModEnabled ? "✅" : "❌"}`,
						`Action: ${settings.autoModAction ?? "warn"}`,
						`Spam Threshold: ${settings.autoModSpamThreshold}`,
						`Bad Links: ${settings.autoModBadLinks ? "✅" : "❌"}`,
						`Max Mentions: ${settings.autoModMaxMentions}`,
					].join("\n"),
				},
				{
					name: "Anti-Raid",
					value: [
						`Enabled: ${settings.antiRaidEnabled ? "✅" : "❌"}`,
						`Threshold: ${settings.antiRaidJoinThreshold} joins / ${settings.antiRaidJoinWindow}s`,
					].join("\n"),
				},
				{
					name: "Starboard",
					value: `Threshold: ${settings.starThreshold} ⭐`,
				},
				{
					name: "AI Personality",
					value: [
						`Profiling: ${settings.personalityEnabled ? "✅" : "❌"}`,
						`Random Response: ${settings.randomResponseChance > 0 ? `${settings.randomResponseChance}%` : "Disabled"}`,
						`Response Channel: ${settings.randomResponseChannelId ? `<#${settings.randomResponseChannelId}>` : "Not set"}`,
					].join("\n"),
				},
			)
			.setTimestamp();

		return interaction.editReply({ embeds: [embed] });
	}

	public async chatInputSet(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const setting = interaction.options.getString("setting", true);
		const spec = settingSpec(setting);
		if (!spec) return interaction.editReply(`❌ **${setting}** is not a configurable setting.`);

		const channel = interaction.options.getChannel("channel");
		const role = interaction.options.getRole("role");
		const number = interaction.options.getInteger("number");
		const text = interaction.options.getString("text");
		const toggle = interaction.options.getBoolean("toggle");

		let value: string | number | boolean;
		if (spec.kind === "channel" && channel) {
			if (!isTextChannelType(channel.type)) {
				return interaction.editReply(
					`❌ <#${channel.id}> is not a text or announcement channel. Categories, voice, stage, forum, and thread channels cannot be used for **${setting}**.`,
				);
			}
			value = channel.id;
		} else if (spec.kind === "role" && role) value = role.id;
		else if (spec.kind === "number" && number !== null) {
			if (number < spec.min || number > spec.max) {
				return interaction.editReply(`❌ **${spec.name}** must be between ${spec.min} and ${spec.max}.`);
			}
			value = number;
		} else if (spec.kind === "text" && text) value = text;
		else if (spec.kind === "boolean" && toggle !== null) value = toggle;
		else if (spec.kind === "boolean" && text) {
			const lower = text.toLowerCase();
			if (lower === "true" || lower === "false") value = lower === "true";
			else return interaction.editReply("❌ Boolean settings require `true` or `false` as the text value.");
		} else return interaction.editReply("❌ Please provide the correct option type for this setting.");

		await updateSettings(interaction.guildId!, { [setting]: value });
		return interaction.editReply(`✅ Setting **${setting}** updated successfully.`);
	}

	public async chatInputReset(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const setting = interaction.options.getString("setting", true);
		if (!settingSpec(setting)) return interaction.editReply(`❌ **${setting}** is not a configurable setting.`);

		const value = resetValue(setting as ConfigurableSetting);
		await updateSettings(interaction.guildId!, { [setting]: value });
		return interaction.editReply(
			value === null
				? `✅ Setting **${setting}** cleared.`
				: `✅ Setting **${setting}** reset to its default (${value}).`,
		);
	}

	public async chatInputAutoMod(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const change = autoModChange(
			interaction.options.getString("setting", true),
			interaction.options.getString("value"),
			interaction.options.getInteger("number"),
		);
		if ("error" in change) return interaction.editReply(`❌ Nothing changed. ${change.error}`);

		await updateSettings(interaction.guildId!, change.updates);
		return interaction.editReply(`✅ Auto-mod updated: ${change.summary}.`);
	}

	public async chatInputAntiRaid(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const change = antiRaidChange(
			interaction.options.getString("setting", true),
			interaction.options.getInteger("number"),
		);
		if ("error" in change) return interaction.editReply(`❌ Nothing changed. ${change.error}`);

		await updateSettings(interaction.guildId!, change.updates);
		return interaction.editReply(`✅ Anti-raid updated: ${change.summary}.`);
	}
}
