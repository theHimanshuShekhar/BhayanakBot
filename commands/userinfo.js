const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
  user = message.mentions.members.first()
    ? message.guild.member(message.mentions.members.first())
    : message.guild.member(message.author);
  var options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  requser = user.user;

  const roles = message.guild.member(user).roles.cache;

  const UserInfo = new Discord.MessageEmbed()
    .setTitle("User Information")
    .setThumbnail(requser.avatarURL())
    .setColor("#6457A6")
    .addField("Username", requser, true)
    .addField("Tag", requser.tag, true)
    .addField(
      "Created At",
      requser.createdAt.toLocaleString("en-IN", options),
      true
    )
    .addField("ID", requser.id, true)
    .addField(
      "Bot",
      requser.bot.toString().charAt(0).toUpperCase() +
        requser.bot.toString().slice(1),
      true
    )
    .addField("Roles", getRoles(roles))
    .setTimestamp()
    .setFooter("Requested by " + `${message.author.username}`);
  if (requser.lastMessage) {
    UserInfo.addField("Last Message", requser.lastMessage);
  }
  message.channel.send(UserInfo);
};

function getRoles(roles) {
  rolelist = Array.from(roles.map((role) => `${role.name} `));
  rolelist.pop();
  return rolelist.join(", ");
}

module.exports.help = {
  name: "user",
};
