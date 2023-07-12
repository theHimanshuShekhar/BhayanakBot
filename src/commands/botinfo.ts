import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

@ApplyOptions<Command.Options>({
	name: 'bot',
	aliases: ['botinfo'],
	description: 'Responds with information about the bot'
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
		const { client } = this.container;
		const commandList = Array.from(client.stores.get('commands').values()).map((command) => {
			return {
				name: command.name,
				description: command.description
			};
		});

		let botInfoEmbed = new EmbedBuilder()
			.setTitle('Click here to add me to your server!')
			.setURL('https://discord.com/api/oauth2/authorize?client_id=470814535146536972&permissions=8&scope=bot')
			.setDescription('Server administration bot')
			.setImage('https://i.imgur.com/ps8otef.jpg')
			.setColor('#6457A6')
			.setTimestamp()
			.addFields(
				{
					name: 'Name',
					value: client.user?.username || 'BhayanakBot',
					inline: true
				},
				{
					name: 'Created on​',
					value: client.user ? client.user.createdAt.toDateString() : '',
					inline: true
				},
				{
					name: 'Server Count',
					value: client.guilds.cache.size + ' servers',
					inline: true
				},
				{
					name: 'Connected to servers​',
					value: Array.from(client.guilds.cache)
						.map((guild) => guild[1].name)
						.join(', '),
					inline: true
				}
			);

		let botCommandsEmbed = new EmbedBuilder()
			.setTitle(`Total Commands- ${commandList.length}`)
			.setColor('#6457A6')
			.addFields({ name: 'Total Commands', value: commandList.length + ' commands' });
		commandList.forEach((command) => botCommandsEmbed.addFields({ name: command.name, value: command.description, inline: true }));

		return interaction.reply({ embeds: [botInfoEmbed, botCommandsEmbed] });
	}
}
