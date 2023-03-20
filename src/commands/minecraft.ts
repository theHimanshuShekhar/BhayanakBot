import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "../types";
import { readFileSync } from "fs";

const command: Command = {
  name: "mc",
  execute: (message, args) => {
    try {
      const data = readFileSync("serverDetails.json", "utf8");
      let server = JSON.parse(data);

      if (server) {
        const botembed = new EmbedBuilder()
          .setColor("#6457A6")
          .setThumbnail("https://pbs.twimg.com/media/DHLaTWSUwAAfzqX.jpg")
          .setTitle(server.url.substr(6))
          .setDescription(server.description)
          .setTimestamp()
          .setFooter(server.name);

        message.channel.send({ embeds: [botembed] });
      }
    } catch (err) {
      console.error(err);
    }
  },
  cooldown: 10,
  aliases: ["minecraft"],
  permissions: ["Administrator", PermissionFlagsBits.SendMessages],
};

export default command;
