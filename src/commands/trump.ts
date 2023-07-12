import { ApplyOptions } from '@sapphire/decorators';
import { FetchResultTypes, fetch } from '@sapphire/fetch';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

interface trumpQuoteResponse {
	message: string;
}

@ApplyOptions<Command.Options>({
	name: 'trump',
	aliases: ['donald', 'orange baboon'],
	description: 'random trump quote'
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
		fetch<trumpQuoteResponse>('https://api.whatdoestrumpthink.com/api/v1/quotes/random/', FetchResultTypes.JSON).then((data) => {
			const botembed = new EmbedBuilder().setColor('#6457A6').setAuthor({ name: data.message }).setDescription('-Donald Trump');
			interaction.reply({ embeds: [botembed] });
		});
	}
}
