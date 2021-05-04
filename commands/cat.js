const Discord = require("discord.js");
const fetch = require("node-fetch");

module.exports.run = async (bot, message, args) => {
  fetch("http://aws.random.cat/meow")
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      let botembed = new Discord.MessageEmbed()
        .setColor("#6457A6")
        .setImage(data.file)
        .setFooter("Meow!")
        .setTimestamp();
      message.channel.send(botembed);
    });
};

module.exports.help = {
  name: "meow",
};
