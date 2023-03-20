import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "../types";

const command: Command = {
  name: "woof",
  execute: (message, args) => {
    fetch("https://random.dog/woof.json?filter=mp4,webm")
      .then((response) => response.json())
      .then((data) => {
        if (data) {
          const botembed = new EmbedBuilder()
            .setColor("#6457A6")
            .setImage(data.url)
            .setTimestamp()
            .setFooter({ text: "requested by " + message.author.username });

          message.channel.send({ embeds: [botembed] });
        }
      });
  },
  cooldown: 10,
  aliases: ["dog", "inu"],
  permissions: ["Administrator", PermissionFlagsBits.SendMessages],
};

export default command;
