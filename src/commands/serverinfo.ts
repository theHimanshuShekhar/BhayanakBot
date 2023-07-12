import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

@ApplyOptions<Command.Options>({
	name: 'server',
	aliases: ['serverinfo'],
	description: 'Responds with information about the server'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const server = interaction.guild;

		if (!server) return interaction.reply({ content: 'Something went wrong', ephemeral: true });

		let textChannelCount = 0;
		let voiceChannelCount = 0;

		server.channels.cache.forEach((channel) => {
			switch (channel.type) {
				case 0:
					textChannelCount++;
					break;
				case 2:
					voiceChannelCount++;
					break;
			}
			return { type: channel.type, channelname: channel.name };
		});

		let serverInfoEmbed = new EmbedBuilder()
			.setDescription(server.description)
			.setAuthor({ name: server.name, iconURL: server.iconURL() as string })
			.setThumbnail(server.iconURL())
			.setColor('#6457A6')
			.setTimestamp()
			// .setImage(server.iconURL())
			.addFields(
				{
					name: 'ID',
					value: server.id
				},
				{
					name: 'Created on',
					value: server.createdAt.toDateString(),
					inline: true
				},
				{
					name: 'Members',
					value: `${server.memberCount} members`,
					inline: true
				},
				{
					name: `Channels - ${textChannelCount + voiceChannelCount}`,
					value: `${textChannelCount} text / ${voiceChannelCount} voice`,
					inline: true
				},
				{
					name: `Roles - ${server.roles.cache.size}`,
					value: server.roles.cache.map((role) => role.name).join(', ')
				}
			);

		return interaction.reply({ embeds: [serverInfoEmbed] });
	}
}
