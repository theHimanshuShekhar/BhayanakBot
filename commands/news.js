const Discord = require("discord.js");
const fetch = require("node-fetch")

module.exports.run = async (bot, message, args) => {
    const query = message.content.split(' ').slice(1).join('');
    fetch('https://newsapi.org/v2/everything?q=' + query + '&language=en&sortBy=popularity&apiKey=' + process.env.NEWSAPIKEY)
        .then(response => response.json())
        .then(results => displayResults(results, message.content.split(' ').slice(1).join(' '), message));
}

module.exports.help = {
    name: "news"
}

async function displayResults(results, query, message) {
    results.articles.map((article, index) => {
        if (index < 3) {
            let botembed = new Discord.RichEmbed()
                .setColor("#6457A6")
                .setTitle(article.title)
                .setThumbnail(article.urlToImage);
            botembed.addField(article.author, article.description)
            botembed.addField(article.source.name, article.url)
            botembed.setFooter("Requested by " + `${message.author.username}` + " at " + new Date().toDateString());
            message.channel.send(botembed)
        }
    });
}