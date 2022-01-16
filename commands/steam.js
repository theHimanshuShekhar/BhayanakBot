const Discord = require("discord.js");
const SteamAPI = require("steamapi");
const steam = new SteamAPI(process.env.STEAMAPIKEY);
const relativeDate = require("sugar/date/relative");

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
      steam
        .getUserSummary(id)
        .then(async (summary) => {
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
            .addField(
              "Last Seen",
              relativeDate(new Date(summary.lastLogOff * 1000)),
              true
            )
            .addField(
              "created",
              relativeDate(new Date(summary.created * 1000)),
              true
            )
            .addField("Friends", friends.length, true)
            .addField("Level", level, true)
            // .addField("Primary Group", summary.primaryGroupID, true)
            .addField("Owned Games", games.length);
          if (bans.daysSinceLastBan) {
            if (bans.vacBanned) {
              botembed.addField("VAC Ban", bans.vacBanned, true);
            }
            if (bans.communityBanned) {
              botembed.addField("Community Ban", bans.communityBanned, true);
            }
            botembed.addField(
              "Days since last ban",
              bans.daysSinceLastBan,
              true
            );
          }
          recent
            .slice(0, 3)
            .map((game) =>
              botembed.addField(
                game.name,
                (game.playTime / 60).toFixed(0) + " hours"
              )
            );

          botembed.setFooter("requested by " + message.author.username);

          message.channel.send(botembed);
        })
        .catch((err) => console.error(err));
    })
    .catch(() => message.channel.send("Kuch bhi na dal bc."));
};

module.exports.help = {
  name: "steam",
};
