const Discord = require("discord.js");
const fetch = require("node-fetch");

module.exports.run = async (bot, message, args) => {
  text =
    message.cleanContent.split(" ").slice(1).join(" ") ||
    "Enter some text, dumbass";

  fetch("https://api.funtranslations.com/translate/yoda.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        message.channel.send(`________________________________
        < For an hour now, you must wait >
         --------------------------------`);
        return;
      }
      let botembed = new Discord.MessageEmbed()
        .setColor("#6457A6")
        .setTitle(data.contents.translated)
        .setFooter("- Yoda");
      message.channel.send(botembed);
    });
};

module.exports.help = {
  name: "yoda",
  syntax: ">>yoda [text]",
  description: "convert your message to yoda speak",
};
