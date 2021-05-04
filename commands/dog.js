const Discord = require("discord.js");
const fetch = require("node-fetch");

module.exports.run = async (bot, message, args) => {
  fetch("https://random.dog/woof.json?filter=mp4,webm")
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      let botembed = new Discord.MessageEmbed()
        .setColor("#6457A6")
        .setImage(data.url)
        .setTimestamp()
        .setFooter("Woof!");
      message.channel.send(botembed);
    });
};

module.exports.help = {
  name: "woof",
};
