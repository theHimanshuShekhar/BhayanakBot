const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
  let botembed = new Discord.MessageEmbed()
    .setColor("#6457A6")
    .setTitle("Sunny Paaji is the best!!")
    .setImage("https://images.indianexpress.com/2018/08/sunny-deol-759.jpg")
    .setTimestamp()
    .setFooter(
      '"Crime Master Gogo naam hai mera, aankhen nikal ke gotiyan khelta hun main"'
    );
  message.channel.send(botembed);
};

module.exports.help = {
  name: "paaji",
};
