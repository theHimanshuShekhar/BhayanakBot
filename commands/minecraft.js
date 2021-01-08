const Discord = require("discord.js");

var admin = require("firebase-admin");

const serviceAccount = {
    "type": "service_account",
    "project_id": "bhayanak-minecraft",
    "private_key_id": "4bf62f961773f97e5e330013b594b1dca695498f",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCwFQYJa+J8TOhP\nsBI5ZXcqsnCrzFEEfBB1vTVfuwPbNylTavzat0rwe6I0jGarBobQf1IKpq+LSCfq\n5jYA2ARsNOOikLPTbGPYVs9eNzTIWesYQUGsCuxiYW4QsShoKCGr8yzrWugvSD2C\nn68LCU/smAAFLAsF5SMz10cMnHivzRP36iG61WvJdbK2JWWGJLoSPfXMB5L7HYKk\nmnxqBR2NJAPGhy5XtizweNAsWIuLYVgU/kJxmE5Rp3Ypmm/QgWfagypaZLbo1zFJ\nD0Z+k1/ojWiozIn+YIVF5lCI9oz49mefBeLdtU9bMJ8cB2ZOKKfZL3e+TJkttm+p\niWTDSJ23AgMBAAECggEABGCsGGqI5EjlMwClngJacW1ORSHR7H1JIM7mF3iGzVm/\nD/Ew/XRhIJQc9uwmq/SAQDQUzhRRePJU9mS9eE075D93CVZKTOSnoXvxsTNI1Ken\no0q8CehGSDaJOKZZjX1cmPHKxBnWe+vH27TXR+b2CGPJsayOpEQ2GSvY+wSeMNYA\nYFXrHDLZWyQ8MPOfttqpM+gCnCRVGC+i/oXVTI+5g3+mqvoUvR2+h/pipje0yZYk\nhwZ9R7W7y+b+Utx4S8JBUr6cvX5+Ji4oj95OHcCv13jrxd9eap8jSw3vs6kvDq/9\nJaCMBTiJy22uTyylAqoZCbyPEIe2b5X12AtEv1yzAQKBgQD43zBnD/Ldvc1Tuhwt\nYc5OJp86X0Bt7y+htFRG1nkwdcEft8MO2EnGqXtIoOXCAD+VVbdx5bzo8hL4jNHo\n2+OKBQj3k+YfHaM7IYn6/RWlKGyjy+/uXFO/2HqXTYPyxb4BR4KhmcOpNDfmAbb+\nZISErvgk2IWe/QRFrnG39e9SRwKBgQC1IB2+hlW9tOMiQTKYHoSAQb2NGmdr+67z\nPn6XPh9K20nUj7ImvyNXjTxiKQkmWug8sqbse3ZJ4d12ngUz9eRLqRM1e2g7uIKC\nZ82tVG3EXLVq+HCsf6iK2BGgrhxIhKc/VPEwcA8h97VpkhlHwmWLuk49/Jg2omNh\nLnPv2G8hEQKBgQD0EW5WpL152XpUcmDP4OuCmT3u8RsutTPxUfiUwCF59QHBKWaS\nWGuB+RR+1cx9xeCVg8q0WKo7iawxNWlnBL7RzL5Ojy1PtrEufGXlT+66WjqxKH/V\nM5auvo77c3nDzUnZ11e1RCcu+ZcYavYb5lhQB4g0GmRw15IpBDtiPj7GYQKBgHS+\nqK1fZPCMIUK5B2Vpdjo9JXJHrJW7ef6rL2lIz16ujZ4GqOu0k5EhJeSXUqB4Q+yr\nslAHHC1u+hI0tGHTgj0KU6lLS9oCiYyIX9fy7XV91CmIzQdCmV40+te4od5UMoDt\nvTBdakOYqEPNuaG5OT6g7UGjCHFepfPDv1K/DJIhAoGBAPNgHV8ZVYyaqR/eR1Sq\nuXtt+1F53McxSqWCqNmx/EmNS+4lPJWB5CYPEJ7k2+U3dUSAbnkMjHvzuHTgLmhH\n6+Sv9lDZdsmN37/up5fi+V61n/zWHN7gS10W4jC8FLpA0bno9wsIKWPapBd67VUG\nxSIv2Zrr8D/REaWHH4LjmCnB\n-----END PRIVATE KEY-----\n",
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
    let vanilla
    let modded
    const doc = await db.collection('bhayanak').doc('minecraft-server').get();
    if (!doc.exists) {
        console.log('No such document!');
      } else {
        vanilla = doc.data().vanilla
        modded = doc.data().modded
      }

//     let vanembed = new Discord.RichEmbed()
//     .setColor("#6457A6")
//     .setThumbnail("https://pbs.twimg.com/media/DHLaTWSUwAAfzqX.jpg")
//     .setTitle(vanilla.slice(8))
//     .setFooter("Bhayanak Vanilla Server")

    let modembed = new Discord.RichEmbed()
    .setColor("#FF0000")
    .setThumbnail("https://i.pinimg.com/originals/93/72/e1/9372e1f34fedaf9848e0214f97e4299a.jpg")
    .setTitle(modded.slice(8))
    .addField('Download Cracked FTB Launcher', 'https://mc-launcher.com/files/unc/FeedTheBeast.exe')
    .addField('Install the FTB Revelations pack','for Minecraft 1.12.2')
    .addField('Install Proximity Ingame Voice Chat Mod','https://www.curseforge.com/minecraft/mc-mods/glibys-voice-chat-reloaded/download/3096282')
    .setFooter("Bhayanak Modded Server")

// message.channel.send(vanembed);
message.channel.send(modembed);
};

module.exports.help = {
  name: "mc",
};
