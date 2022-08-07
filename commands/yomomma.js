const Discord = require("discord.js");
const fetch = require("node-fetch");

module.exports.run = async (bot, message, args) => {
  user = message.mentions.members.first()
    ? message.mentions.users.first()
    : message.author;

  fetch("https://yomomma-api.herokuapp.com/jokes")
    .then((response) => response.json())
    .then(async (data) => {
      nickname = (await message.guild.member(user).nickname) || user.username;
      let botembed = new Discord.MessageEmbed()
        .setColor("#6457A6")
        .setTitle(nickname + ", " + data.joke);
      message.channel.send(botembed);
      message.delete();
    })
    .catch((err) => {
      console.log(err);
    });
};

module.exports.help = {
  name: "yomomma",
  syntax: ">>yomomma [user]",
  description: "send yomomma joke to user",
};
