const Discord = require("discord.js");
const fetch = require("node-fetch");

module.exports.run = async (bot, message, args) => {
  fetch(
    "http://www.omdbapi.com/?" +
      new URLSearchParams({
        apikey: process.env.OMDB_KEY,
        t: args.join(" "),
      })
  )
    .then((response) => response.json())
    .then((movie) => {
      if (!movie) return;
      let botembed = new Discord.MessageEmbed()
        .setColor("#6457A6")
        .setTitle(movie.Title)
        .setDescription(movie.Plot)
        .addField("Runtime", movie.Runtime, true)
        .addField("Director", movie.Director, true)
        .addField("Released", movie.Released, true)
        .addField("Rated", movie.Rated, true)
        .addField("Genre", movie.Genre, true)
        .addField("Country", movie.Country, true)
        .addField("Actors", movie.Actors)
        .setTimestamp()
        .setFooter("requested by " + message.author.username);

      if (movie.Poster) botembed.setImage(movie.Poster);
      if (movie.Ratings)
        movie.Ratings.forEach((rating) => {
          botembed.addField(rating.Source, rating.Value, true);
        });
      message.channel.send(botembed);
    })
    .catch((err) => console.log(err));
};

module.exports.help = {
  name: "movie",
  syntax: ">>movie [search term]",
  description: "Search for a movie",
};
