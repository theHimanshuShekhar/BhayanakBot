const Discord = require("discord.js");

module.exports.run = async (bot, message, args, db) => {
  let vanilla;
  let doc = null;
  try {
    doc = await db.collection("minecraft").doc("vanilla").get();
  } catch (err) {
    console.error(err);
  }

  if (!doc) {
    console.log("No such document!");
  } else {
    vanilla = doc.data().ip;
    let vanembed = new Discord.MessageEmbed()
      .setColor("#6457A6")
      .setThumbnail("https://pbs.twimg.com/media/DHLaTWSUwAAfzqX.jpg")
      .setTitle(vanilla.slice(8))
      .setTimestamp()
      .addField("Required java17 for 1.18", "https://tinyurl.com/zulu17")
      .setFooter("Bhayanak Vanilla Minecraft");

    message.channel.send(vanembed);
  }
};

module.exports.help = {
  name: "mc",
};
