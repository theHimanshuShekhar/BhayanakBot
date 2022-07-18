const Discord = require("discord.js");
const fetch = require("node-fetch");

module.exports.run = async (bot, message, args) => {
  fetch("https://api.kanye.rest/")
    .then((response) => response.json())
    .then((data) => {
      let botembed = new Discord.MessageEmbed()
        .setColor("#6457A6")
        .setTitle(data.quote)
        .setDescription("- Kanye West")
        .setTimestamp()
        .setFooter("requested by " + message.author.username);
      message.channel.send(botembed);
    });
};

module.exports.help = {
  name: "kanye",
  syntax: ">>kanye",
  description: "display a random kanye quote",
};
