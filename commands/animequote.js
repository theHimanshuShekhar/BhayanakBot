const Discord = require("discord.js");
const fetch = require("node-fetch");

module.exports.run = async (bot, message, args) => {
  fetch("https://animechan.vercel.app/api/random")
    .then((response) => response.json())
    .then((data) => {
      let botembed = new Discord.MessageEmbed()
        .setColor("#6457A6")
        .setTitle(data.quote)
        .setFooter("-" + data.character + ", " + data.anime);
      message.channel.send(botembed);
    });
};

module.exports.help = {
  name: "animequote",
  syntax: "animequote",
  description: "display a random anime quote",
};
