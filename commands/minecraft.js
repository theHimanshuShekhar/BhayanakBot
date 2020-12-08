const Discord = require("discord.js");

var admin = require("firebase-admin");

const serviceAccount = {
    "type": "service_account",
    "project_id": "bhayanak-minecraft",
    "private_key_id": "4bf62f961773f97e5e330013b594b1dca695498f",
    "private_key": process.env.FIRESTORE_KEY,
    "client_email": "firebase-adminsdk-qlm7l@bhayanak-minecraft.iam.gserviceaccount.com",
    "client_id": "117897820599341960567",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-qlm7l%40bhayanak-minecraft.iam.gserviceaccount.com"
  }

admin.initializeApp({
credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports.run = async (bot, message, args) => {
    let url
    const doc = await db.collection('bhayanak').doc('minecraft-server').get();
    if (!doc.exists) {
        console.log('No such document!');
      } else {
        url = doc.data().ip
      }

    let botembed = new Discord.RichEmbed()
    .setColor("#6457A6")
    .setThumbnail("https://i.imgur.com/GzOprvb.jpg")
    .setTitle(url.slice(8))
    .setFooter("Bhayanak Minecraft Server")

message.channel.send(botembed);
};

module.exports.help = {
  name: "mc",
};
