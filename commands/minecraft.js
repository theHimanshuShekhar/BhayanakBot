const Discord = require("discord.js");
const fs = require("fs");

module.exports.run = async (bot, message, args, db) => {
  try {
    let server;
    const data = fs.readFileSync("serverDetails.json");
    server = JSON.parse(data);

    if (server) {
      let embed = new Discord.MessageEmbed()
        .setColor("#6457A6")
        .setThumbnail("https://pbs.twimg.com/media/DHLaTWSUwAAfzqX.jpg")
        .setTitle(server.url.substr(6))
        .setDescription(server.description)
        .setTimestamp()
        .setFooter(server.name);
      message.channel.send(embed);
    }
  } catch (err) {
    console.error(err);
  }
};

module.exports.help = {
  name: "mc",
  syntax: ">>mc",
  description: "display the minecraft server IP",
};
