import { Subcommand } from "@sapphire/plugin-subcommands";
import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { createRoleMenu, deleteRoleMenu, addRoleMenuOption, getRoleMenu } from "../../db/queries/roles.js";

export class RoleMenuCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "create", chatInputRun: "runCreate" },
				{ name: "delete", chatInputRun: "runDelete" },
				{ name: "add-option", chatInputRun: "runAddOption" },
			],
			preconditions: ["GuildOnly", "IsAdmin"],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("rolemenu")
				.setDescription("Manage role select menus")
				.addSubcommand((sub) =>
					sub
						.setName("create")
						.setDescription("Create a role selection menu in a channel")
						.addChannelOption((opt) =>
							opt.setName("channel").setDescription("Channel to post the menu in").setRequired(true),
						)
						.addStringOption((opt) =>
							opt.setName("placeholder").setDescription("Placeholder text for the menu").setRequired(false),
						)
						.addIntegerOption((opt) =>
							opt.setName("max-values").setDescription("Max roles selectable at once (default 1)").setMinValue(1).setRequired(false),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("delete")
						.setDescription("Delete a role menu by message ID")
						.addStringOption((opt) =>
							opt.setName("message-id").setDescription("Message ID of the role menu").setRequired(true),
						),
				)
				.addSubcommand((sub) =>
					sub
						.setName("add-option")
						.setDescription("Add a role option to an existing role menu")
						.addStringOption((opt) =>
							opt.setName("message-id").setDescription("Message ID of the role menu").setRequired(true),
						)
						.addRoleOption((opt) => opt.setName("role").setDescription("Role to add as option").setRequired(true))
						.addStringOption((opt) => opt.setName("label").setDescription("Option label").setRequired(true))
						.addStringOption((opt) =>
							opt.setName("description").setDescription("Option description").setRequired(false),
						)
						.addStringOption((opt) => opt.setName("emoji").setDescription("Option emoji").setRequired(false)),
				),
		);
	}

	public async runCreate(interaction: Subcommand.ChatInputCommandInteraction) {
		const channel = interaction.options.getChannel("channel", true);
		const placeholder = interaction.options.getString("placeholder") ?? "Select a role...";
		const maxValues = interaction.options.getInteger("max-values") ?? 1;

		if (!("send" in channel)) {
			return interaction.reply({ content: "That channel is not a text channel.", ephemeral: true });
		}

		const select = new StringSelectMenuBuilder()
			.setCustomId("rolemenu_placeholder")
			.setPlaceholder(placeholder)
			.setMinValues(0)
			.setMaxValues(maxValues)
			.addOptions(new StringSelectMenuOptionBuilder().setLabel("Loading...").setValue("loading"));

		const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
		const msg = await (channel as any).send({ content: "**Role Menu** — Select your roles below:", components: [row] });

		const menu = await createRoleMenu({
			messageId: msg.id,
			channelId: channel.id,
			guildId: interaction.guildId!,
			placeholder,
			maxValues,
		});

		// Update customId with real menu ID
		select.setCustomId(`rolemenu:${menu.id}`);
		await msg.edit({ components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });

		return interaction.reply({
			content: `Role menu created! Message ID: \`${msg.id}\`. Use \`/rolemenu add-option\` to add roles to it.`,
			ephemeral: true,
		});
	}

	public async runDelete(interaction: Subcommand.ChatInputCommandInteraction) {
		const messageId = interaction.options.getString("message-id", true);
		const menu = await getRoleMenu(messageId);
		if (!menu) {
			return interaction.reply({ content: "No role menu found with that message ID.", ephemeral: true });
		}

		const channel = interaction.guild!.channels.cache.get(menu.channelId);
		if (channel && "messages" in channel) {
			const msg = await (channel as any).messages.fetch(messageId).catch(() => null);
			await msg?.delete().catch(() => null);
		}

		await deleteRoleMenu(messageId);
		return interaction.reply({ content: "Role menu deleted.", ephemeral: true });
	}

	public async runAddOption(interaction: Subcommand.ChatInputCommandInteraction) {
		const messageId = interaction.options.getString("message-id", true);
		const role = interaction.options.getRole("role", true);
		const label = interaction.options.getString("label", true);
		const description = interaction.options.getString("description") ?? undefined;
		const emoji = interaction.options.getString("emoji") ?? undefined;

		const menu = await getRoleMenu(messageId);
		if (!menu) {
			return interaction.reply({ content: "No role menu found with that message ID.", ephemeral: true });
		}

		await addRoleMenuOption({ menuId: menu.id, roleId: role.id, label, description, emoji });

		// Rebuild the select menu on the message
		const { getRoleMenuOptions } = await import("../../db/queries/roles.js");
		const options = await getRoleMenuOptions(menu.id);

		const select = new StringSelectMenuBuilder()
			.setCustomId(`rolemenu:${menu.id}`)
			.setPlaceholder(menu.placeholder ?? "Select a role...")
			.setMinValues(0)
			.setMaxValues(Math.min(menu.maxValues, options.length))
			.addOptions(
				options.map((opt) => {
					const builder = new StringSelectMenuOptionBuilder()
						.setLabel(opt.label)
						.setValue(opt.roleId);
					if (opt.description) builder.setDescription(opt.description);
					if (opt.emoji) builder.setEmoji(opt.emoji);
					return builder;
				}),
			);

		const channel = interaction.guild!.channels.cache.get(menu.channelId);
		if (channel && "messages" in channel) {
			const msg = await (channel as any).messages.fetch(messageId).catch(() => null);
			if (msg) {
				const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
				await msg.edit({ components: [row] }).catch(() => null);
			}
		}

		return interaction.reply({ content: `Added **${label}** (<@&${role.id}>) to the role menu.`, ephemeral: true });
	}
}
