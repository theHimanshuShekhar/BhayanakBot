const ytdl = require('ytdl-core');

const streamOptions = {
    seek: 0,
    volume: 1
};

module.exports.run = async (bot, message, args) => {
    if (!message.guild) return;
    if (message.author.bot) return;

    if (message.member.voiceChannelID) {
        bot.channels.get(message.member.voiceChannelID).join()
            .then(play);
    } else {
        message.channel.send('You are not in a voice channel!')
    }
}

module.exports.help = {
    name: "hello"
}

play = connection => {
    const stream = ytdl('https://www.youtube.com/watch?v=dYRkmM7xyGA', {
        filter: 'audioonly'
    });
    connection.playStream(stream, streamOptions)
        .on('end', () => connection.disconnect());
}