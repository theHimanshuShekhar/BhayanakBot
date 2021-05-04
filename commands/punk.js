const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
  let botembed = new Discord.MessageEmbed()
    .setColor("#FF69B4")
    .setTitle("punklord")
    .setTimestamp()
    .setImage(
      "https://upload.wikimedia.org/wikipedia/en/thumb/5/55/Jihadi_John.jpg/220px-Jihadi_John.jpg"
    )
    .setFooter('"REST IN PEACE"');
  message.channel.send(botembed);
};

module.exports.help = {
  name: "punk",
};
