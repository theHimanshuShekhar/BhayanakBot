const Discord = require("discord.js");
const SteamAPI = require("steamapi");
const steam = new SteamAPI(process.env.STEAMAPIKEY);

const personastates = [
  "Offline",
  "Online",
  "Busy",
  "Away",
  "Snooze",
  "looking to trade",
  "looking to play",
];
module.exports.run = async (bot, message, args) => {
  const steamuser = message.content.split(" ")[1];
  steam
    .resolve("https://steamcommunity.com/id/" + steamuser)
    .then((id) => {
      steam.getUserSummary(id).then(async (summary) => {
        // console.log(summary);
        let bans = await steam.getUserBans(id);
        let friends = await steam.getUserFriends(id);
        let level = await steam.getUserLevel(id);
        let games = await steam.getUserOwnedGames(id);
        let recent = await steam.getUserRecentGames(id);

        let botembed = new Discord.MessageEmbed()
          .setColor("#6457A6")
          .setTitle(summary.nickname + " " + summary.url)
          .setURL(summary.url)
          .setImage(summary.avatar.large)
          .setFooter(
            "Requested by " +
              `${message.author.username}` +
              " at " +
              new Date().toLocaleString()
          )
          .setTimestamp()
          .addField("State", personastates[summary.personaState], true)
          .addField("steamID", summary.steamID, true)
          .addField("Friends", friends.length, true)
          .addField("Level", level, true)
          .addField("Primary Group", summary.primaryGroupID, true)
          .addField("Owned Games", games.length, true);
        if (bans.daysSinceLastBan) {
          if (bans.vacBanned) {
            botembed.addField("VAC Ban", bans.vacBanned, true);
          }
          if (bans.communityBanned) {
            botembed.addField("Community Ban", bans.communityBanned, true);
          }
          botembed.addField("Days since last ban", bans.daysSinceLastBan, true);
        }
        // botembed.addField('Recent Games', '\u200b')
        recent
          .slice(0, 3)
          .map((game) =>
            botembed.addField(
              game.name,
              (game.playTime / 60).toFixed(0) + " hours"
            )
          );
        let date = new Date();
        date.setTime(summary.lastLogOff);
        botembed.setFooter("requested by " + message.author.username);
        //     .addField('Last Seen', new Date().setSeconds(summary.lastLogOff))
        //     .addField('created', new Date().setSeconds(summary.created))
        //
        message.channel.send(botembed);
      });
    })
    .catch(() => message.channel.send("Kuch bhi na dal bc."));
};

module.exports.help = {
  name: "steam",
};
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
