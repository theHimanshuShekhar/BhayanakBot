import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

@ApplyOptions<Command.Options>({
	name: 'kanye',
	aliases: ['ye', 'yeezus'],
	description: 'random kanye quote'
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
		fetch('https://api.kanye.rest/')
			.then((response) => response.json())
			.then((data) => {
				if (data) {
					const botembed = new EmbedBuilder().setColor('#6457A6').setAuthor({ name: data.quote }).setDescription('-Kanye West');
					interaction.reply({ embeds: [botembed] });
				}
			});
	}
}
