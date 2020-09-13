const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    voiceChannel = message.member.voiceChannel;
    if (voiceChannel) {
        msg = '';
        voiceChannel.members.map(member => {
            member.setMute(!member.serverMute);
            msg = member.serverMute ? 'unmuted' : 'muted';
        });
        reply = [voiceChannel.members.size, voiceChannel.members.size == 1 ? " member " : " members ", msg]
        message.reply(reply.join(""));
    } else {
        message.reply('You need to join a voice channel first!');
    }
}

module.exports.help = {
    name: "au"
}