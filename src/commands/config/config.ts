import { Subcommand } from "@sapphire/plugin-subcommands";
import {
	ApplicationCommandOptionType,
	ChannelType,
	EmbedBuilder,
	type ChatInputCommandInteraction,
	MessageFlags,
} from "discord.js";
import { getOrCreateSettings, updateSettings } from "../../db/queries/guildSettings.js";

export class ConfigCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			name: "config",
			description: "Configure BhayanakBot settings for this server",
			preconditions: ["GuildOnly", "IsAdmin"],
			help: {
				summary: "Configure server channels, roles, auto-moderation, and anti-raid settings.",
				examples: ["/config view", "/config set setting:log-channel channel:#mod-log", "/config automod setting:spam-threshold number:5"],
				subcommands: {
					view: { summary: "View current server configuration.", examples: ["/config view"] },
					set: { summary: "Set a configuration value for a specific setting.", examples: ["/config set setting:log-channel channel:#mod-log"] },
					automod: { summary: "Configure auto-moderation thresholds.", examples: ["/config automod setting:spam-threshold number:5"] },
					antiraid: { summary: "Configure anti-raid protection (join rate limits).", examples: ["/config antiraid setting:threshold number:10"] },
				},
			},
			subcommands: [
				{ name: "view", chatInputRun: "chatInputView" },
				{ name: "set", chatInputRun: "chatInputSet" },
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
								.addChoices(
									{ name: "welcome-channel", value: "welcomeChannelId" },
									{ name: "goodbye-channel", value: "goodbyeChannelId" },
									{ name: "log-channel", value: "logChannelId" },
									{ name: "level-up-channel", value: "levelUpChannelId" },
									{ name: "music-channel", value: "musicChannelId" },
									{ name: "starboard-channel", value: "starboardChannelId" },
									{ name: "ticket-category", value: "ticketCategoryId" },
									{ name: "auto-role", value: "autoRole" },
									{ name: "muted-role", value: "mutedRoleId" },
									{ name: "ticket-support-role", value: "ticketSupportRoleId" },
									{ name: "dj-role", value: "djRoleId" },
									{ name: "moderator-role", value: "moderatorRoleId" },
									{ name: "star-threshold", value: "starThreshold" },
									{ name: "xp-rate", value: "xpRate" },
									{ name: "xp-cooldown", value: "xpCooldownSeconds" },
									{ name: "welcome-message", value: "welcomeMessage" },
									{ name: "goodbye-message", value: "goodbyeMessage" },
									{ name: "level-up-message", value: "levelUpMessage" },
								),
						)
						.addChannelOption((opt) => opt.setName("channel").setDescription("Channel to set"))
						.addRoleOption((opt) => opt.setName("role").setDescription("Role to set"))
						.addIntegerOption((opt) => opt.setName("number").setDescription("Number value").setMinValue(1).setMaxValue(1000))
						.addStringOption((opt) => opt.setName("text").setDescription("Text value (for messages)")),
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
						.addIntegerOption((opt) => opt.setName("number").setDescription("Numeric value").setMinValue(1).setMaxValue(100)),
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
						.addIntegerOption((opt) => opt.setName("number").setDescription("Numeric value").setMinValue(1).setMaxValue(100)),
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
						`Log: ${settings.logChannelId ? `<#${settings.logChannelId}>` : "Not set"}`,
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
			)
			.setTimestamp();

		return interaction.editReply({ embeds: [embed] });
	}

	public async chatInputSet(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const setting = interaction.options.getString("setting", true) as keyof typeof settingMap;
		const channel = interaction.options.getChannel("channel");
		const role = interaction.options.getRole("role");
		const number = interaction.options.getInteger("number");
		const text = interaction.options.getString("text");

		const channelSettings = [
			"welcomeChannelId", "goodbyeChannelId", "logChannelId", "levelUpChannelId",
			"musicChannelId", "starboardChannelId", "ticketCategoryId",
		];
		const roleSettings = ["autoRole", "mutedRoleId", "ticketSupportRoleId", "djRoleId", "moderatorRoleId"];
		const numberSettings = ["starThreshold", "xpRate", "xpCooldownSeconds"];
		const textSettings = ["welcomeMessage", "goodbyeMessage", "levelUpMessage"];

		let value: string | number | null = null;
		if (channelSettings.includes(setting) && channel) value = channel.id;
		else if (roleSettings.includes(setting) && role) value = role.id;
		else if (numberSettings.includes(setting) && number !== null) value = number;
		else if (textSettings.includes(setting) && text) value = text;
		else return interaction.editReply("❌ Please provide the correct option type for this setting.");

		await updateSettings(interaction.guildId!, { [setting]: value });
		return interaction.editReply(`✅ Setting **${setting}** updated successfully.`);
	}

	// Setting name map kept for type reference
	// biome-ignore lint/correctness/noUnusedVariables: used for type safety

	public async chatInputAutoMod(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const setting = interaction.options.getString("setting", true);
		const value = interaction.options.getString("value");
		const number = interaction.options.getInteger("number");

		const updates: Record<string, unknown> = {};
		switch (setting) {
			case "enable": updates.autoModEnabled = true; break;
			case "disable": updates.autoModEnabled = false; break;
			case "spamThreshold": if (number) updates.autoModSpamThreshold = number; break;
			case "badLinks": updates.autoModBadLinks = value === "true"; break;
			case "maxMentions": if (number) updates.autoModMaxMentions = number; break;
			case "action": if (value && ["warn", "mute", "kick"].includes(value)) updates.autoModAction = value; break;
			case "muteDuration": if (number) updates.autoModMuteDuration = number * 60000; break; // minutes to ms
		}

		await updateSettings(interaction.guildId!, updates);
		return interaction.editReply(`✅ Auto-mod setting **${setting}** updated.`);
	}

	public async chatInputAntiRaid(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const setting = interaction.options.getString("setting", true);
		const number = interaction.options.getInteger("number");

		const updates: Record<string, unknown> = {};
		switch (setting) {
			case "enable": updates.antiRaidEnabled = true; break;
			case "disable": updates.antiRaidEnabled = false; break;
			case "threshold": if (number) updates.antiRaidJoinThreshold = number; break;
			case "window": if (number) updates.antiRaidJoinWindow = number; break;
		}

		await updateSettings(interaction.guildId!, updates);
		return interaction.editReply(`✅ Anti-raid setting **${setting}** updated.`);
	}
}

const settingMap = {} as const;
