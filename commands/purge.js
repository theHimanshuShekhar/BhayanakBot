const Discord = require("discord.js");

module.exports.run = async (bot, message, args) => {
  try {
    if (message.member.hasPermission(["KICK_MEMBERS", "BAN_MEMBERS"])) {
      const user = message.mentions.users.first();
      // Parse Amount
      const amount = !!parseInt(message.content.split(" ")[1])
        ? parseInt(message.content.split(" ")[1])
        : parseInt(message.content.split(" ")[2]);
      if (!amount) return message.reply("Must specify an amount to delete!");
      if (!amount && !user)
        return message.reply(
          "Must specify a user and amount, or just an amount, of messages to purge!"
        );
      // Fetch 100 messages (will be filtered and lowered up to max amount requested)
      if (user) {
        message.channel.messages.fetch().then((messages) => {
          if (user) {
            const filterBy = user ? user.id : Client.user.id;
            messages = messages
              .filter((m) => m.author.id === filterBy)
              .array()
              .slice(0, amount + 1);
            message.channel
              .bulkDelete(messages)
              .catch((error) => console.log(error.stack));
          }
        });
      } else {
        if (amount) {
          message.channel
            .bulkDelete(amount < 100 ? amount + 1 : 100)
            .catch((error) => console.log(error.stack));
        }
      }
    } else {
      message.reply(
        "You don't have sufficient permissions to use this command!"
      );
    }
  } catch (err) {
    message.reply(err);
  }
};

module.exports.help = {
  name: "purge",
};
