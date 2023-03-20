import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "../types";

const command: Command = {
  name: "animechan",
  execute: (message, args) => {
    fetch("https://animechan.vercel.app/api/random")
      .then((response) => response.json())
      .then((data) => {
        if (data.quote) {
          const botembed = new EmbedBuilder()
            .setColor("#6457A6")
            .setAuthor({ name: data.character + ", " + data.anime })
            .setDescription(data.quote)
            .setTimestamp()
            .setFooter({ text: "requested by " + message.author.username });

          message.channel.send({ embeds: [botembed] });
        }
      });
  },
  cooldown: 10,
  aliases: ["animequote"],
  permissions: ["Administrator", PermissionFlagsBits.SendMessages],
};

export default command;
