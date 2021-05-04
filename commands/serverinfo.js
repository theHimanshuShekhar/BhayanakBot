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
  let serverembed = new Discord.MessageEmbed()
    .setColor("#6457A6")
    .setTitle("Server Information")
    .setThumbnail(message.guild.displayAvatarURL)
    .addField("Name", message.guild.name, true)
    .addField("Created on", createDate, true)
    // .addField(
    //   "Owner",
    //   `${message.guild.owner} ${message.guild.owner.displayName}`,
    //   true
    // )
    .addField("Server region", message.guild.region, true)
    .addField("Total Members", message.guild.memberCount, true)
    .addField("You joined", joinDate)
    .setImage(message.guild.bannerURL() || message.guild.iconURL())
    .setTimestamp()
    .setFooter("requested by " + message.author.username);
  message.channel.send(serverembed);

  console.log(message.guild.bannerURL());
};

module.exports.help = {
  name: "server",
};
