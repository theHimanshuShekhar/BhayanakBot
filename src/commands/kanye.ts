import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "../types";

const command: Command = {
  name: "kanye",
  execute: (message, args) => {
    fetch("https://api.kanye.rest/")
      .then((response) => response.json())
      .then((data) => {
        if (data) {
          const botembed = new EmbedBuilder()
            .setColor("#6457A6")
            .setAuthor({ name: "Kanye West" })
            .setDescription(data.quote)
            .setTimestamp()
            .setFooter({ text: "requested by " + message.author.username });

          message.channel.send({ embeds: [botembed] });
        }
      });
  },
  cooldown: 10,
  aliases: ["yee", "yeezus"],
  permissions: ["Administrator", PermissionFlagsBits.SendMessages],
};

export default command;
