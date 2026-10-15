import { AllFlowsPrecondition } from "@sapphire/framework";
import type { CommandInteraction, ContextMenuCommandInteraction, Guild, GuildMember, Message } from "discord.js";
import { getVoiceChannelRefusal } from "../lib/music/voiceChannel.js";

export class InBotVoiceChannelPrecondition extends AllFlowsPrecondition {
	public override messageRun(message: Message) {
		return message.guild && message.member
			? this.check(message.guild, message.member)
			: this.error({ message: "This command can only be used in a server." });
	}

	public override chatInputRun(interaction: CommandInteraction) {
		return this.checkInteraction(interaction);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.checkInteraction(interaction);
	}

	private async checkInteraction(interaction: CommandInteraction | ContextMenuCommandInteraction) {
		if (!interaction.guild) return this.error({ message: "This command can only be used in a server." });
		const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
		if (!member) return this.error({ message: "Could not find your member data." });
		return this.check(interaction.guild, member);
	}

	private check(guild: Guild, member: GuildMember) {
		const refusal = getVoiceChannelRefusal(guild, member);
		return refusal ? this.error({ message: refusal }) : this.ok();
	}
}

declare module "@sapphire/framework" {
	interface Preconditions {
		InBotVoiceChannel: never;
	}
}
