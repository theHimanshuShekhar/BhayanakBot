import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import * as fs from 'fs';
import * as path from 'path';

@ApplyOptions<Command.Options>({
	name: 'sound',
	description: 'Soundboard for fun and dank maymays'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		// Get all soundboard files from /assets/soundboard
		// const soundBoardList: string[] = getSounds();
		// console.log(soundBoardList);

		// getSounds();

		registry.registerChatInputCommand(
			(builder) =>
				builder //
					.setName(this.name)
					.setDescription(this.description)
			// .addSubcommand((subCommand) => subCommand.setName('ktmsund'))
			// .addSubcommand((subCommand) => subCommand.setName('gn4'))
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		return interaction.reply({ content: 'Hello world!' });
	}
}

export function getSounds() {
	const soundboardDir = path.join(__dirname, '../../assets/soundboard');

	fs.readdir(soundboardDir, (err: NodeJS.ErrnoException | null, files: string[]) => {
		if (err) {
			console.error(err);
			return;
		}

		files.forEach((file: string) => {
			console.log(file);
		});
	});
}

// Example to refactor | Note- it is message command and not slash command
// if (!message.member.voiceChannel) {
//     return errors.userNotInChannel(message);
//   } else {
//     message.member.voiceChannel.join().then(connection => {
//       console.log(`[${message.guild}] ${message.author.username} has issued the ${module.exports.help.name} command.`)
//       const dispatcher = connection.playFile('./effects/ahh.mp3');

//       dispatcher.on('end', end => {
//         message.member.voiceChannel.leave();
//       });
//     })
//   }
