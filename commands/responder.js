const Discord = require("discord.js");

module.exports.run = async (bot, message, args, db) => {
  if (message.member.hasPermission(["KICK_MEMBERS", "BAN_MEMBERS"])) {
    const responderCollection = db.collection("responder");
    switch (args[0]) {
      case "addcategory":
        if (args[1]) {
          let newcategory = args[1];
          responderCollection
            .doc(newcategory)
            .get()
            .then((docSnapshot) => {
              if (docSnapshot.exists) {
                message.reply("category already exists!");
              } else {
                responderCollection
                  .doc(newcategory)
                  .set({ createdOn: new Date() });
              }
            });
        } else {
          message.channel.reply("Specify a category");
        }
        break;
      case "categories":
        db.collection("responder")
          .get()
          .then((categorySnapshots) => {
            categories = [];
            const embed = new Discord.MessageEmbed();
            categorySnapshots.forEach((categorySnapshot) =>
              categories.push(categorySnapshot.id)
            );
            embed.addField("Categories", categories.join("\n"));
            message.channel.send(embed);
          });
        break;
      case "addlink":
        if (args[1] && args[2]) {
          let category = args[1];
          let link = args[2];
          db.collection("responder")
            .doc(category)
            .collection("links")
            .doc()
            .set({
              url: link,
            });
        } else {
          message.channel.reply("Specify a category and link");
        }
        break;
      case "adduser":
        if (message.mentions.members.first() && args[2] && args[3]) {
          let user = message.mentions.members.first();
          usercategory = args[2];
          chance = args[3];
          db.collection("users")
            .doc(user.id)
            .collection("categories")
            .doc(usercategory)
            .set({
              name: usercategory,
              addedOn: new Date(),
              chance: parseInt(chance),
            })
            .then(() =>
              message.reply(`Category ${usercategory} set on user ${user}`)
            );
        } else {
          message.channel.reply(
            "Specify a user, category and chance of responding"
          );
        }
        break;

      default:
        message.reply("Please enter correct syntax of the command");
    }
  } else {
    message.reply("You don't have sufficient permissions to use this command!");
  }

  //   console.log(user, category, link);
};

module.exports.help = {
  name: "res",
};
