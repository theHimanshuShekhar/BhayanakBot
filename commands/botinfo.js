const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    let createDate = bot.user.createdAt.toLocaleString("en-IN", options);
    snum = (bot.guilds.size > 1) ? " servers" : " server";
    let botembed = new Discord.RichEmbed()
        .setColor("#6457A6")
        .setTitle("Bot Information")
        .setThumbnail(bot.user.displayAvatarURL)
        .addField("Name", bot.user.username)
        .addField("Description", "Server administration bot")
        .addField("Created on", createDate)
        .addField("Currently Online in", bot.guilds.size + snum)
        .setImage("https://i.imgur.com/ps8otef.jpg")
        .setFooter("\"Crime Master Gogo naam hai mera, aankhen nikal ke gotiyan khelta hun main\"");
    message.channel.send(botembed);
}

module.exports.help = {
    name: "bot"
}