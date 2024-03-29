import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

interface catResponse {
	url: string;
}

@ApplyOptions<Command.Options>({
	name: 'meow',
	description: 'for cat lovers',
	aliases: ['cat', 'neko'],
	cooldownDelay: 10
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
		fetch('https://api.thecatapi.com/v1/images/search')
			.then((response) => response.json())
			.then((data: catResponse[]) => {
				if (data.length > 0) {
					const botembed = new EmbedBuilder().setColor('#6457A6').setImage(data[0].url);
					interaction.reply({ embeds: [botembed] });
				}
			});
	}
}
