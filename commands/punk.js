const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    let botembed = new Discord.RichEmbed()
        .setColor("#FF69B4")
        .setTitle("pranklord")
        .setImage("https://www.pegitboard.com/pics/t/297226.jpg")
        .setFooter("\"PUNK IS GHEY BOI PLAYING DED GAMEZ!\"");
    message.channel.send(botembed);
}

module.exports.help = {
    name: "punk"
}