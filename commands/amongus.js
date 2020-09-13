const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
   if (message.member.voice.channel) {
            let channel = message.guild.channels.cache.get(message.member.voice.channel.id);
            for (const [memberID, member] of channel.members) {
                member.voice.setMute(!message.member.voice.serverMute);
            }
            if (message.member.voice.serverMute) {
                message.reply('Find that impostor');
            } else message.reply('Shhhhh!')
        } else {
            message.reply('You need to join a voice channel first!');
        }
}

module.exports.help = {
    name: "AU"
}
