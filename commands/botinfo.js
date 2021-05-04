const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
  var options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  let createDate = bot.user.createdAt.toLocaleString("en-IN", options);
  let botembed = new Discord.MessageEmbed()
    .setURL(
      "https://discord.com/oauth2/authorize?client_id=470814535146536972&permissions=0&redirect_uri=https%3A%2F%2Fbhayanak-bot.herokuapp.com%2F&response_type=code&scope=email%20guilds%20bot%20activities.read%20identify%20connections"
    )
    .setColor("#6457A6")
    .setTitle("Click here to add me to your server!")
    .setThumbnail(bot.user.displayAvatarURL)
    .addField("Name", bot.user.username)
    .addField("Description", "Server administration bot")
    .addField("Created on", createDate)
    .addField(
      "Currently Online in",
      `${Array.from(bot.guilds.cache).length} servers`
    )
    .setTimestamp()
    .addField("Website", "https://bhayanak-bot.herokuapp.com")
    .setImage("https://i.imgur.com/ps8otef.jpg")
    .setFooter("requested by " + message.author.username);
  message.channel.send(botembed);
};

module.exports.help = {
  name: "bot",
};
