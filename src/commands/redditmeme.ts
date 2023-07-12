import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

// Reddits to add to enhance this command - dankrishu, indiandankmemes, dankindia, mandirgang, suddenlygay, indiameme, IAmTheMainCharacter

@ApplyOptions<Command.Options>({
	name: 'meme',
	description: 'A random meme from r/memes'
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
		fetch('https://www.reddit.com/r/memes/random/.json')
			.then((response) => response.json())
			.then((result) => result[0].data.children[0].data)
			.then((post) => {
				const botembed = new EmbedBuilder()
					.setColor('Random')
					.setTitle(post.title)
					.setImage(post.url)
					.setURL(post.url)
					.setFooter({
						text: `👍 ${post.ups} | 💬 ${post.num_comments}`
					});
				interaction.reply({ embeds: [botembed] });
			});
	}
}
