const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    if (message.mentions.members.first()) {
        requser = message.guild.members.get(message.mentions.members.first().id).user;
        var options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        // getRoles(message, requser);
        const UserInfo = new Discord.RichEmbed()
            .setTitle('User Information')
            .setThumbnail(requser.avatarURL)
            .setColor('#6457A6')
            .addField("User", requser.username + requser, true)
            .addField('Tag', requser.tag, true)
            .addField('Status', getStatus(requser.presence), true)
            .addField('Created At', requser.createdAt.toLocaleString("en-IN", options), true)
            .addField('ID', requser.id, true)
            .addField('Bot', requser.bot.toString().charAt(0).toUpperCase() + requser.bot.toString().slice(1), true)
            .setTimestamp()
            .setFooter("Requested by " + `${message.author.username}`)
        if (requser.lastMessage) {
            UserInfo.addField('Last Message', requser.lastMessage)
        }
        message.channel.send(UserInfo);
    } else message.channel.send("Please enter valid user!");
}

function getRoles(message, requser) {
    if (message.guild.available) {
        let roles = requser;
        console.log(roles);
    }
}

function getStatus(presence) {
    var status = presence.status;
    status = status.charAt(0).toUpperCase() + status.slice(1);
    if (presence.game) {
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