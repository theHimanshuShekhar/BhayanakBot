const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    if(message.mentions.members.first()) {
        requser = message.guild.members.get(message.mentions.members.first().id).user;
        var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const UserInfo = new Discord.RichEmbed()
        .setTitle('User Information')
        .setThumbnail(requser.avatarURL)
        .setColor('#6457A6')
        .addField("User", requser)
        .addField('Tag', requser.tag)
        .addField('Username', requser.username)
        .addField('Status', getStatus(requser.presence))
        .addField('Created At', requser.createdAt.toLocaleString("en-IN", options), false)
        .addField('ID', requser.id)
        .addField('Last Message', requser.lastMessage)
        .addField('Bot', requser.bot.toString().charAt(0).toUpperCase() + requser.bot.toString().slice(1), true)
        .setTimestamp()
        .setFooter("Requested by " + `${message.author.username}`)
        message.channel.send(UserInfo);
    }
    else message.channel.send("Please enter valid user!");
}

function getStatus(presence) {
    var status = presence.status;
    status = status.charAt(0).toUpperCase() + status.slice(1);
    if(presence.game) {
        if (presence.game.name === "Spotify") {
            status = status + '\nListening to ' + presence.game.name;
        } else {
            status = status + '\nPlaying ' + presence.game.name;
        }
    }
    return status;
}


module.exports.help = {
    name: "user"
}



