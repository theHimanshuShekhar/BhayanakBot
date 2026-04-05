import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { getRoleMenuOptions, getRoleMenu } from "../db/queries/roles.js";

export class RoleMenuSelectHandler extends InteractionHandler {
	public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.customId.startsWith("rolemenu:")) return this.none();
		return this.some();
	}

	public override async run(interaction: StringSelectMenuInteraction) {
		const menuId = parseInt(interaction.customId.split(":")[1], 10);
		const member = interaction.guild?.members.cache.get(interaction.user.id) ??
			await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);

		if (!member) {
			return interaction.reply({ content: "Could not find your member data.", ephemeral: true });
		}

		const options = await getRoleMenuOptions(menuId);
		const selectedRoleIds = new Set(interaction.values);
		const allMenuRoleIds = options.map((o) => o.roleId);

		const toAdd = allMenuRoleIds.filter((id) => selectedRoleIds.has(id) && !member.roles.cache.has(id));
		const toRemove = allMenuRoleIds.filter((id) => !selectedRoleIds.has(id) && member.roles.cache.has(id));

		for (const roleId of toAdd) {
			await member.roles.add(roleId).catch(() => null);
		}
		for (const roleId of toRemove) {
			await member.roles.remove(roleId).catch(() => null);
		}

		const addedNames = toAdd.map((id) => `<@&${id}>`).join(", ");
		const removedNames = toRemove.map((id) => `<@&${id}>`).join(", ");

		const parts: string[] = [];
		if (addedNames) parts.push(`Added: ${addedNames}`);
		if (removedNames) parts.push(`Removed: ${removedNames}`);

		return interaction.reply({
			content: parts.length > 0 ? parts.join("\n") : "No changes made.",
			ephemeral: true,
		});
	}
}
