const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
    let botembed = new Discord.RichEmbed()
        .setColor("#FF69B4")
        .setTitle("punklord")
        .setImage("https://upload.wikimedia.org/wikipedia/en/thumb/5/55/Jihadi_John.jpg/220px-Jihadi_John.jpg")
        .setFooter("\"Takbir My Nigger!"");
    message.channel.send(botembed);
}

module.exports.help = {
    name: "punk"
}
