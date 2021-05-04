const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
  let botembed = new Discord.MessageEmbed()
    .setColor("#6457A6")
    .setTitle("Commands")
    .addField(">>bot", "display BhayanakBot's information")
    .addField(">>server", "display the server information")
    .addField(">>user [user]", "display the user's information")
    .addField(">>news [topic]", "display news articles based on query")
    .addField(">>purge [?user] [amount]", "purge messages in a text channel")
    .addField(">>meow", "for cute kitties!")
    .addField(">>woof", "for cute doggos!")
    .addField(">>au [mute/unmute]", "mute/unmute for among us games.")
    .setThumbnail(bot.user.displayAvatarURL)
    .addField(
      "Contribute to development of the bot",
      "https://github.com/theHimanshuShekhar/BhayanakBot"
    )
    .setTimestamp()
    .setFooter("? = optional parameters");

  message.channel.send(botembed);
};

module.exports.help = {
  name: "help",
};
