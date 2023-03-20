import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "../types";

const command: Command = {
  name: "movie",
  execute: (message, args) => {
    const searchParams = new URLSearchParams();
    searchParams.set(
      "apikey",
      process.env.OMDB_KEY ? process.env.OMDB_KEY : ""
    );
    searchParams.set("t", args.slice(1).join(" "));

    fetch("http://www.omdbapi.com/?" + searchParams)
      .then((response) => response.json())
      .then((movie) => {
        if (!movie) return;
        const botembed = new EmbedBuilder()
          .setTitle(movie.Title)
          .setDescription(movie.Plot)
          .setImage(movie.Poster)
          .addFields(
            {
              name: "Runtime",
              value: movie.Runtime,
              inline: true,
            },
            {
              name: "Director",
              value: movie.Director,
              inline: true,
            },
            {
              name: "Released",
              value: movie.Released,
              inline: true,
            },
            {
              name: "Rated",
              value: movie.Rated,
              inline: true,
            },
            {
              name: "Genre",
              value: movie.Genre,
              inline: true,
            },
            {
              name: "Country",
              value: movie.Country,
              inline: true,
            },
            {
              name: "Actors",
              value: movie.Actors,
              inline: true,
            }
          )
          .setTimestamp()
          .setFooter({ text: "requested by " + message.author.username });

        message.channel.send({ embeds: [botembed] });
      });
  },
  cooldown: 10,
  aliases: ["imdb"],
  permissions: ["Administrator", PermissionFlagsBits.SendMessages],
};

export default command;
