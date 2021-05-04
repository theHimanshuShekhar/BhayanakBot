const Discord = require("discord.js");

module.exports.run = (bot, message, args) => {
  let options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  let createDate = message.guild.createdAt.toLocaleString("en-IN", options);
  let joinDate = message.member.joinedAt.toLocaleString("en-IN", options);
  let serverembed = new Discord.RichEmbed()
    .setColor("#6457A6")
    .setTitle("Server Information")
    .setThumbnail(message.guild.displayAvatarURL)
    .addField("Name", message.guild.name, true)
    .addField("Created on", createDate, true)
    .addField(
      "Description",
      "Discord gaming server for mostly Indian FPS players"
    )
    .addField("Server region", message.guild.region, true)
    .addField("Total Members", message.guild.memberCount, true)
    .addField("You joined", joinDate)
    .setImage("https://i.imgur.com/GzOprvb.jpg")
    .setFooter('"Main hu Nandu, sabka bandhu"');
  message.channel.send(serverembed);
};

module.exports.help = {
  name: "server",
};
