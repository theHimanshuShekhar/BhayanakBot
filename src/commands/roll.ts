import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "../types";

const randomIntFromInterval = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1) + min);

const command: Command = {
  name: "roll",
  execute: (message, args) => {
    let numbers = args.splice(1).map((string) => parseInt(string));

    if (numbers.length < 1) {
      return message.channel.send("Please provide a number to roll.");
    }
    if (numbers.length > 1 && (isNaN(numbers[0]) || isNaN(numbers[1]))) {
      return message.channel.send("Please use numbers for the dice roll.");
    }
    if (numbers.length === 1 && isNaN(numbers[0])) {
      return message.channel.send("Please use numbers for the dice roll.");
    }

    let max,
      min = 0;
    if (numbers.length > 1) {
      min = numbers[0];
      max = numbers[1];
    } else {
      max = numbers[0];
    }

    const botembed = new EmbedBuilder()
      .setColor("#6457A6")
      .addFields({
        name: randomIntFromInterval(min, max).toString(),
        value: "Rolled between " + min + " and " + max,
      })
      .setTimestamp()
      .setFooter({ text: "requested by " + message.author.username });

    message.channel.send({ embeds: [botembed] });
  },
  cooldown: 10,
  aliases: ["dice", "luck"],
  permissions: ["Administrator", PermissionFlagsBits.SendMessages],
};

export default command;
