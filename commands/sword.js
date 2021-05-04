const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
  let botembed = new Discord.MessageEmbed()
    .setColor("#FF0000")
    .setTitle("Sword")
    .setImage("https://img.memecdn.com/facts_o_7204860.jpg")
    .setTimestamp()
    .setFooter(
      '"Almighty the one and only Sword THE HARD CARRIER The one who always shine when its the darkest"'
    );
  message.channel.send(botembed);
};

module.exports.help = {
  name: "sword",
};
