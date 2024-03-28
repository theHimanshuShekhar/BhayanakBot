import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

@ApplyOptions<Command.Options>({
	name: 'imdb',
	aliases: ['show', 'movie'],
	description: 'search for details about a movie or tv show from imdb'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
				.addStringOption((searchOption) =>
					searchOption.setName('searchterm').setDescription('Enter a movie or show to search').setRequired(true)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const searchString = interaction.options.data[0].value?.toString();
		if (searchString) {
			const searchParams = new URLSearchParams();
			searchParams.set('apikey', process.env.OMDB_KEY ? process.env.OMDB_KEY : '');
			searchParams.set('t', searchString);

			fetch('http://www.omdbapi.com/?' + searchParams)
				.then((response) => response.json())
				.then((movie) => {
					if (!movie) return;
					const botembed = new EmbedBuilder().setTitle(movie.Title).setDescription(movie.Plot).setImage(movie.Poster).addFields(
						{
							name: 'Runtime',
							value: movie.Runtime,
							inline: true
						},
						{
							name: 'Director',
							value: movie.Director,
							inline: true
						},
						{
							name: 'Released',
							value: movie.Released,
							inline: true
						},
						{
							name: 'Rated',
							value: movie.Rated,
							inline: true
						},
						{
							name: 'Genre',
							value: movie.Genre,
							inline: true
						},
						{
							name: 'Country',
							value: movie.Country,
							inline: true
						},
						{
							name: 'Actors',
							value: movie.Actors,
							inline: true
						}
					);

					interaction.reply({ embeds: [botembed] });
				});
		}
	}
}
