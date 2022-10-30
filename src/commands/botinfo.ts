import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "../types";

var options = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const command: Command = {
  name: "bot",
  execute: (message, args) => {
    let servers = message.client.guilds.cache;

    const thumbnail = message.client.user
      ? message.client.user.avatarURL()
      : null;

    const createdDate = message.client.user
      ? message.client.user.createdAt.toLocaleString("en-IN", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    let botInfoEmbed = new EmbedBuilder()
      .setTitle("Click here to add me to your server!")
      .setThumbnail(thumbnail)
      .setURL(
        "https://discord.com/api/oauth2/authorize?client_id=470814535146536972&permissions=8&scope=bot"
      )
      .setDescription("Server administration bot")
      .addFields(
        {
          name: "Name",
          value: message.client.user
            ? message.client.user?.username
            : "BhayanakBot",
          inline: true,
        },
        {
          name: "Server Count​",
          value: servers.size + " servers",
          inline: true,
        },
        {
          name: "Created on​",
          value: createdDate,
        },
        {
          name: "Following servers",
          value: servers.map((server) => server.name).join(", "),
        }
      )
      .setImage("https://i.imgur.com/ps8otef.jpg")
      .setTimestamp()
      .setFooter({ text: "requested by " + message.author.username });

    message.channel.send({ embeds: [botInfoEmbed] });
  },

  cooldown: 10,
  aliases: ["botinfo"],
  permissions: ["Administrator", PermissionFlagsBits.SendMessages], // to test
};

export default command;
