require('dotenv').config();
const Discord = require("discord.js");
const fs = require("fs");
const bot = new Discord.Client({
    disableEveryone: true
});
bot.commands = new Discord.Collection;

fs.readdir("./commands/", (err, files) => {
    console.clear();
    if (err) console.log(err);
    let jsfile = files.filter(f => f.split(".").pop() === "js");
    if (jsfile && jsfile.length <= 0) {
        console.log("Could not find commands.");
        return;
    } else {
        jsfile.forEach((file, index) => {
            let props = require(`./commands/${file}`);
            console.log(`${file} loaded.`);
            bot.commands.set(props.help.name, props);
        });
    }
});

bot.on("ready", async () => {
    console.log(`${bot.user.username} is online on ${bot.guilds.size} servers!`);
    bot.user.setActivity(">>help", {
        type: "WATCHING"
    });
});

bot.on("message", async message => {
    if (message.author.bot) return;
    if (message.channel.type === "dm") return;

    let prefix = process.env.PREFIX;
    let messageArray = message.content.split(" ");
    let cmd = messageArray[0];
    let args = messageArray.slice(1);
    let commandfile = bot.commands.get(cmd.slice(prefix.length));
    if (commandfile) commandfile.run(bot, message, args);
});

bot.login(process.env.TOKEN);

const http = require('http');

setInterval(function () {
    http.get("http://bhayanak-bot.herokuapp.com");
}, 600000);


// Webserver
"use strict";
const express = require("express");
const compression = require("compression");
const app = express();
app.use(compression());

const _app_folder = 'website/dist/website';
const _port = process.env.PORT || 8080;

app.get('*.*', express.static(_app_folder, {
    maxAge: '1y'
}));

app.all('*', function (req, res) {
    res.status(200).sendFile(`/`, {
        root: _app_folder
    });
});

app.listen(_port, function () {
    console.log("Node Express server for " + app.name + " listening on " + _port);
});