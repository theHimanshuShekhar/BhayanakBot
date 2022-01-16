require("dotenv").config();
const Discord = require("discord.js");
const fs = require("fs");

var admin = require("firebase-admin");

const serviceAccount = {
  type: "service_account",
  project_id: "bhayanakbot",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: "firebase-adminsdk-xbmk9@bhayanakbot.iam.gserviceaccount.com",
  client_id: "110232804916755363996",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:
    "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xbmk9%40bhayanakbot.iam.gserviceaccount.com",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const bot = new Discord.Client({
  disableEveryone: true,
});

bot.commands = new Discord.Collection();

fs.readdir("./commands/", (err, files) => {
  console.clear();
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

bot.on("ready", () => {
  console.log(
    `${bot.user.username} is online on ${
      Array.from(bot.guilds.cache).length
    } servers!`
  );

  bot.user.setActivity(process.env.PREFIX, {
    type: "LISTENING",
  });

  console.log(bot.guilds.cache.map((g) => g.name).join("\n"));
});

bot.on("message", async (message) => {
  if (message.author.bot) return;
  if (message.channel.type === "dm") return;

  let prefix = process.env.PREFIX;
  let messageArray = message.content.split(" ");
  let cmd = messageArray[0];
  let args = messageArray.slice(1);
  let commandfile = bot.commands.get(cmd.slice(prefix.length));
  if (commandfile) commandfile.run(bot, message, args, db);
});

const percentageChance = (percentage) => Math.random() * 100 < percentage;

bot.login(process.env.TOKEN);

const http = require("http");

setInterval(function () {
  http.get("http://bhayanak-bot.herokuapp.com");
}, 600000);

// Webserver
("use strict");
const express = require("express");
const compression = require("compression");
const app = express();
app.use(compression());

const _app_folder = "website/dist/website";
const _port = process.env.PORT || 8080;

app.get(
  "*.*",
  express.static(_app_folder, {
    maxAge: "1y",
  })
);

app.all("*", function (req, res) {
  res.status(200).sendFile(`/`, {
    root: _app_folder,
  });
});

app.listen(_port, function () {
  console.log("Node Express server for " + app.name + " listening on " + _port);
});
