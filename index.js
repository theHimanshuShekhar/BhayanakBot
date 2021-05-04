require("dotenv").config();
const Discord = require("discord.js");
const fs = require("fs");

var admin = require("firebase-admin");

const serviceAccount = {
  type: "service_account",
  project_id: "bhayanak-minecraft",
  private_key_id: "4bf62f961773f97e5e330013b594b1dca695498f",
  private_key:
    "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCwFQYJa+J8TOhP\nsBI5ZXcqsnCrzFEEfBB1vTVfuwPbNylTavzat0rwe6I0jGarBobQf1IKpq+LSCfq\n5jYA2ARsNOOikLPTbGPYVs9eNzTIWesYQUGsCuxiYW4QsShoKCGr8yzrWugvSD2C\nn68LCU/smAAFLAsF5SMz10cMnHivzRP36iG61WvJdbK2JWWGJLoSPfXMB5L7HYKk\nmnxqBR2NJAPGhy5XtizweNAsWIuLYVgU/kJxmE5Rp3Ypmm/QgWfagypaZLbo1zFJ\nD0Z+k1/ojWiozIn+YIVF5lCI9oz49mefBeLdtU9bMJ8cB2ZOKKfZL3e+TJkttm+p\niWTDSJ23AgMBAAECggEABGCsGGqI5EjlMwClngJacW1ORSHR7H1JIM7mF3iGzVm/\nD/Ew/XRhIJQc9uwmq/SAQDQUzhRRePJU9mS9eE075D93CVZKTOSnoXvxsTNI1Ken\no0q8CehGSDaJOKZZjX1cmPHKxBnWe+vH27TXR+b2CGPJsayOpEQ2GSvY+wSeMNYA\nYFXrHDLZWyQ8MPOfttqpM+gCnCRVGC+i/oXVTI+5g3+mqvoUvR2+h/pipje0yZYk\nhwZ9R7W7y+b+Utx4S8JBUr6cvX5+Ji4oj95OHcCv13jrxd9eap8jSw3vs6kvDq/9\nJaCMBTiJy22uTyylAqoZCbyPEIe2b5X12AtEv1yzAQKBgQD43zBnD/Ldvc1Tuhwt\nYc5OJp86X0Bt7y+htFRG1nkwdcEft8MO2EnGqXtIoOXCAD+VVbdx5bzo8hL4jNHo\n2+OKBQj3k+YfHaM7IYn6/RWlKGyjy+/uXFO/2HqXTYPyxb4BR4KhmcOpNDfmAbb+\nZISErvgk2IWe/QRFrnG39e9SRwKBgQC1IB2+hlW9tOMiQTKYHoSAQb2NGmdr+67z\nPn6XPh9K20nUj7ImvyNXjTxiKQkmWug8sqbse3ZJ4d12ngUz9eRLqRM1e2g7uIKC\nZ82tVG3EXLVq+HCsf6iK2BGgrhxIhKc/VPEwcA8h97VpkhlHwmWLuk49/Jg2omNh\nLnPv2G8hEQKBgQD0EW5WpL152XpUcmDP4OuCmT3u8RsutTPxUfiUwCF59QHBKWaS\nWGuB+RR+1cx9xeCVg8q0WKo7iawxNWlnBL7RzL5Ojy1PtrEufGXlT+66WjqxKH/V\nM5auvo77c3nDzUnZ11e1RCcu+ZcYavYb5lhQB4g0GmRw15IpBDtiPj7GYQKBgHS+\nqK1fZPCMIUK5B2Vpdjo9JXJHrJW7ef6rL2lIz16ujZ4GqOu0k5EhJeSXUqB4Q+yr\nslAHHC1u+hI0tGHTgj0KU6lLS9oCiYyIX9fy7XV91CmIzQdCmV40+te4od5UMoDt\nvTBdakOYqEPNuaG5OT6g7UGjCHFepfPDv1K/DJIhAoGBAPNgHV8ZVYyaqR/eR1Sq\nuXtt+1F53McxSqWCqNmx/EmNS+4lPJWB5CYPEJ7k2+U3dUSAbnkMjHvzuHTgLmhH\n6+Sv9lDZdsmN37/up5fi+V61n/zWHN7gS10W4jC8FLpA0bno9wsIKWPapBd67VUG\nxSIv2Zrr8D/REaWHH4LjmCnB\n-----END PRIVATE KEY-----\n",
  client_email:
    "firebase-adminsdk-qlm7l@bhayanak-minecraft.iam.gserviceaccount.com",
  client_id: "117897820599341960567",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:
    "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-qlm7l%40bhayanak-minecraft.iam.gserviceaccount.com",
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
  bot.user.setActivity(">>", {
    type: "LISTENING",
  });
});

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
