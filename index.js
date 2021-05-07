require("dotenv").config();
const Discord = require("discord.js");
const fs = require("fs");
import responder from "./utilities/responder";
import logger from "./utilities/logger";

// Establish mongoose connection with mongodb
const mongoose = require("mongoose");
mongoose
  .connect("mongodb://database:27017", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
  })
  .then(() => console.log("MongoDB connection successful"));
var db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

// Create bot client
const bot = new Discord.Client({
  disableEveryone: true,
});

// Initalize bot command collection into command module
bot.commands = new Discord.Collection();

// Load commands from commands dir into command module
fs.readdir("./commands/", (err, files) => {
  if (err) console.log(err);
  let jsfile = files.filter((f) => f.split(".").pop() === "js");
  if (jsfile && jsfile.length <= 0) {
    console.log("Could not find commands.");
    return;
  } else {
    cmds = "";
    jsfile.forEach((file, index) => {
      let props = require(`./commands/${file}`);
      cmds = cmds + `${file.split(".")[0]} `;
      bot.commands.set(props.help.name, props);
    });
    console.log("Commands Loaded:");
    console.log(cmds);
  }
});

// Listener for when bot is connected to Discord API
bot.on("ready", () => {
  console.log(
    `${bot.user.username} is online on ${
      Array.from(bot.guilds.cache).length
    } servers!`
  );
  bot.user.setActivity(">>", {
    type: "LISTENING",
  });
});

// Listener for when a message is sent
bot.on("message", async (message) => {
  // if (message.author.bot) return;
  if (message.channel.type === "dm") return;

  let prefix = process.env.PREFIX;
  let messageArray = message.content.split(" ");
  let cmd = messageArray[0];
  let args = messageArray.slice(1);
  let commandfile = bot.commands.get(cmd.slice(prefix.length));
  if (commandfile) commandfile.run(bot, message, args, db);
});

// Listener for when message is sent
// Used by logger and autoresponder
bot.on("message", async (message) => {
  responder(db, message);
  logger(db, message);
});

// Authenticate and login to Discord API using token
bot.login(process.env.TOKEN);
