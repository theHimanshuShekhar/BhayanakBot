const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    let botembed = new Discord.RichEmbed()
        .setColor("##FF0000")
        .setTitle("punklord")
        .setImage("https://cdn.cnn.com/cnnnext/dam/assets/140919185303-tsr-dnt-todd-isis-flames-of-war-00001413-story-top.jpg")
        .setFooter("\"Shut up fuckin' dog!\"");
    message.channel.send(botembed);
}

module.exports.help = {
    name: "punk"
}