const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    if (args.length > 1) {
        operation = args[0];
        voiceChannel = await message.guild.channels.get(args[1]);
    } else {
        if (message.member.hasPermission(["KICK_MEMBERS", "BAN_MEMBERS"])) {
            voiceChannel = message.member.voiceChannel;
            operation = args[0];
        } else {
            message.reply("You need to be an admin to run this command!");
        }
    }

    if (voiceChannel) {
        msg = "";
        names = []
        reply = []
        voiceChannel.members.map(async (member) => {
            member.setMute(operation === 'mute');
            names.push(member.nickname ? member.nickname : member.displayName);
        });
        reply = reply.concat(names).concat([
            voiceChannel.members.size <= 1 ? "is" : "are",
            operation === 'mute' ? 'muted' : 'unmuted',
            `[${names.length} members]`
        ]);
        message.channel.send(reply.join(" ")).then(() => message.delete())
    }
};

module.exports.help = {
    name: "au",
};