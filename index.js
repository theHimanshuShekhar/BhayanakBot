
const fs = require("fs");
require("dotenv").config();
const utils = require("./lib/utils.js");
const Discord = require("discord.js");
const randomGames = require("./lib/random.js");

const prefix = process.env.PREFIX;
const bot = new Discord.Client({
  disableEveryone: true,
  shards: "auto",
});

// Create command array and load all the commands
bot.commands = new Discord.Collection();

// Load commands from commands dir into command module
fs.readdir("./commands/", (err, files) => {
  console.clear();
  if (err) console.log(err);
  let jsfile = files.filter((f) => f.split(".").pop() === "js");
  if (jsfile && jsfile.length <= 0) {
    console.log("Could not find commands.");
    return;
  } else {
    jsfile.forEach((file, index) => {
      let props = require(`./commands/${file}`);
      bot.commands.set(props.help.name, props);
    });
    console.log("Commands Loaded:");
    console.log(jsfile.map((file) => `${file.split(".")[0]}`).join(" "));
  }
});

// Connect bot client to Discord
bot.login(process.env.TOKEN);

// Functions when bot is connected to Discord
bot.on("ready", () => {
  bot.user.setActivity(process.env.PREFIX, {
    type: "LISTENING",
  });
  console.log(
    `${bot.user.username} is online on ${
      Array.from(bot.guilds.cache).length
    } servers!`
  );
  console.log(bot.guilds.cache.map((g) => g.name).join("\n"));
});

// Parse incoming messages and call respective command module
bot.on("message", async (message) => {
  // Random Games
  randomGames.randomGames(message);

  // Return if message author is a bot, message is in a DM or message doesnot start with botprefix
  if (message.author.bot) return;
  if (message.channel.type === "dm") return;
  if (!message.content.startsWith(prefix)) return;


  // Proceed with command processing
  let messageArray = message.content.split(" ");
  let cmd = messageArray[0];
  let args = messageArray.slice(1);
  let commandfile = bot.commands.get(cmd.slice(prefix.length));
  if (commandfile) commandfile.run(bot, message, args, db);
});
