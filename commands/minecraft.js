const Discord = require("discord.js");

module.exports.run = async (bot, message, args, db) => {
  let vanilla;
  const doc = await db.collection("bhayanak").doc("minecraft-server").get();
  if (!doc.exists) {
    console.log("No such document!");
  } else {
    vanilla = doc.data().vanilla;
  }

  let vanembed = new Discord.MessageEmbed()
    .setColor("#6457A6")
    .setThumbnail("https://pbs.twimg.com/media/DHLaTWSUwAAfzqX.jpg")
    .setTitle(vanilla.slice(8))
    .setTimestamp()
    .setFooter("Bhayanak Vanilla Minecraft Server");

  message.channel.send(vanembed);
};

module.exports.help = {
  name: "mc",
};
