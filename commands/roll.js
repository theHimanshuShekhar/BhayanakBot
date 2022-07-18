const Discord = require("discord.js");
const utils = require("../lib/utils.js");

module.exports.run = async (bot, message, args) => {
  if (args.length < 1) {
    return message.channel.send("Please provide a number to roll.");
  }
  if (isNaN(args[0]) || isNaN(args[1]))
    return message.channel.send("Please use numbers for the dice roll.");

  min = 0;
  if (args.length > 1) {
    min = parseInt(args[0]);
    max = parseInt(args[1]);
  } else {
    max = parseInt(args[0]);
  }

  let botembed = new Discord.MessageEmbed()
    .setColor("#6457A6")
    .addField(
      utils.randomIntFromInterval(min, max),
      "Rolled between " + min + " and " + max
    );
  message.channel.send(botembed);
};

module.exports.help = {
  name: "roll",
  syntax: ">>roll <min> <max>",
  description: "roll a dice between <min> and <max>",
};
