const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    let botembed = new Discord.RichEmbed()
        .setColor("#6457A6")
        .setTitle("Commands")
        .addField(">>bot", "display BhayanakBot's information")
        .addField(">>server", "display the server information")
        .addField(">>user [user]", "display the user's information")
        .addField(">>purge [?user] [amount]", "purge messages in a text channel")
        .addField(">>meow", "for cute kitties!")
        .addField(">>woof", "for cute doggos!")
        .setThumbnail(bot.user.displayAvatarURL)
        .addBlankField()
        .setFooter("? = optional parameters")

    message.channel.send(botembed);
}

module.exports.help = {
    name: "help"
}