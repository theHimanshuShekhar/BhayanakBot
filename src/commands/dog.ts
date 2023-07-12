import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';
import { fetch, FetchResultTypes } from '@sapphire/fetch';

interface randomDogResponse {
	url: string;
}

@ApplyOptions<Command.Options>({
	name: 'woof',
	description: 'for dog lovers',
	aliases: ['dog', 'inu'],
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
		fetch<randomDogResponse>('https://random.dog/woof.json?filter=mp4,webm', FetchResultTypes.JSON).then((data) => {
			if (data) {
				const botembed = new EmbedBuilder().setColor('#6457A6').setImage(data.url);
				interaction.reply({ embeds: [botembed] });
			}
		});
	}
}
