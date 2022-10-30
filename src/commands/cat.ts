import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "../types";

const command: Command = {
  name: "meow",
  execute: (message, args) => {
    fetch("http://aws.random.cat/meow")
      .then((response) => response.json())
      .then((data) => {
        if (data) {
          const botembed = new EmbedBuilder()
            .setColor("#6457A6")
            .setImage(data.file)
            .setTimestamp()
            .setFooter({ text: "requested by " + message.author.username });

          message.channel.send({ embeds: [botembed] });
        }
      });
  },
  cooldown: 10,
  aliases: ["cat", "neko"],
  permissions: ["Administrator", PermissionFlagsBits.SendMessages],
};

export default command;
