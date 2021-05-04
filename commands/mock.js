const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
  console.log(args);
  if (message.member.hasPermission(["KICK_MEMBERS", "BAN_MEMBERS"])) {
    let category;

    switch (args[0]) {
      case "adduser":
        let user = args[1];
        category = args[2];
        break;
      case "categorys":
        break;
      case "addlink":
        category = args[1];
        let link = args[2];
        break;
      default:
        message.reply("Please enter correct syntax of command");
    }
  } else {
    message.reply("You don't have sufficient permissions to use this command!");
  }

  //   console.log(user, category, link);
};

module.exports.help = {
  name: "mock",
};
