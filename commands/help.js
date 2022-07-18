const Discord = require("discord.js");
const fs = require("fs");

module.exports.run = async (bot, message, args) => {
  let botembed = new Discord.MessageEmbed()
    .setColor("#6457A6")
    .setTitle("Commands")
    .setThumbnail(bot.user.displayAvatarURL)
    .setTimestamp()
    .setFooter("? = optional parameters");

  let commands = await getCommands();
  commands.forEach((command) => {
    if (command.syntax && command.description)
      botembed.addField(command.syntax, command.description, true);
  });

  botembed
    .addField("\u200b", "\u200b")
    .addField(
      "Contribute to development of the bot",
      "https://github.com/theHimanshuShekhar/BhayanakBot"
    );

  message.channel.send(botembed);
};

module.exports.help = {
  name: "help",
};

getCommands = async () => {
  commands = [];
  const files = fs.readdirSync("./commands/");
  let commandfiles = files.filter((f) => f.split(".").pop() === "js");
  commandfiles.forEach((commandfile) => {
    let command = require(`./${commandfile}`);
    commands.push(command.help);
  });

  return commands;
};
