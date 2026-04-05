import { Listener } from "@sapphire/framework";
import type { MessageReaction, User } from "discord.js";
import { getReactionRole } from "../../db/queries/roles.js";

export class MessageReactionRemoveListener extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: "messageReactionRemove" });
	}

	public override async run(reaction: MessageReaction, user: User) {
		if (user.bot) return;

		if (reaction.partial) await reaction.fetch().catch(() => null);
		if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

		const guild = reaction.message.guild;
		if (!guild) return;

		const emojiKey = reaction.emoji.id ?? reaction.emoji.name ?? "";
		const reactionRole = await getReactionRole(reaction.message.id, emojiKey);
		if (!reactionRole) return;

		// Don't remove on toggle type — toggling already handled in add
		if (reactionRole.type === "toggle") return;

		const member = await guild.members.fetch(user.id).catch(() => null);
		if (!member) return;

		await member.roles.remove(reactionRole.roleId).catch(() => null);
	}
}
