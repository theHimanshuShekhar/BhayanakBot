const Discord = require("discord.js");
const SteamAPI = require('steamapi');
const steam = new SteamAPI(process.env.STEAMAPIKEY);

module.exports.run = async (bot, message, args) => {
    const steamuser = message.content.split(' ')[1];
    steam.resolve('https://steamcommunity.com/id/' + steamuser).then(id => {
        steam.getUserSummary(id).then(async summary => {
            // console.log(summary);
            let bans = await steam.getUserBans(id);
            let friends = await steam.getUserFriends(id);
            let level = await steam.getUserLevel(id);
            let games = await steam.getUserOwnedGames(id);

            let botembed = new Discord.RichEmbed()
                .setColor("#6457A6")
                .setTitle(summary.nickname)
                .setImage(summary.avatar.large)
                .addField('steamID', summary.steamID, true)
                .addField('Friends', friends.length, true)
                .addField('Level', level, true)
                .addField('Primary Group', summary.primaryGroupID, true)
                .addField('Owned Games', games.length, true)
                .addField('url', summary.url)
                // .addField('Last Seen', new Date(summary.lastLogOff))
                // .addField('created', new Date(summary.created))
                .setURL(summary.url)
                .setFooter("Requested by " + `${message.author.username}`)

            if (bans.daysSinceLastBan) {
                if (bans.vacBanned) {
                    botembed.addField('VAC Ban', bans.vacBanned, true)
                }
                if (bans.commuunityBanned) {
                    botembed.addField('Community Ban', bans.commuunityBanned, true)
                }
                botembed.addField('Days since last ban', bans.daysSinceLastBan, true)
            }

            message.channel.send(botembed);
        });
    });
}

module.exports.help = {
    name: "steam"
}
/**
PlayerSummary {
    avatar: {
        small: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/7f/7fdf55394eb5765ef6f7be3b1d9f834fa9c824e8.jpg',
        medium: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/7f/7fdf55394eb5765ef6f7be3b1d9f834fa9c824e8_medium.jpg',
        large: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/7f/7fdf55394eb5765ef6f7be3b1d9f834fa9c824e8_full.jpg'
    },
    steamID: '76561198146931523',
    url: 'http://steamcommunity.com/id/DimGG/',
    created: 1406393110,
    lastLogOff: 1517725233,
    nickname: 'Dim',
    primaryGroupID: '103582791457347196',
    personaState: 1,
    personaStateFlags: 0,
    commentPermission: 1,
    visibilityState: 3
}
*/