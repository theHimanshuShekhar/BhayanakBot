import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

@ApplyOptions<Command.Options>({
	name: 'anime',
	aliases: ['animechan'],
	description: 'random anime quote'
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
		fetch('https://animechan.xyz/api/random')
			.then((response) => response.json())
			.then((data) => {
				const botembed = new EmbedBuilder()
					.setColor('#6457A6')
					.setAuthor({ name: data.quote })
					.setDescription('-' + data.character + ', ' + data.anime);

				interaction.reply({ embeds: [botembed] });
			});
	}
}
