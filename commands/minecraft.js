const Discord = require("discord.js");
let { Client, Entity, Schema, Repository } = require("redis-om");

// Create Redis client
const client = new Client();

async function connect() {
  if (!client.isOpen()) {
    try {
      await client.open(process.env.REDIS_URL);
    } catch (e) {
      console.log("Failed to connect to Redis");
      console.error(e);
    }
  }
}

class MCServer extends Entity {}
let MCServerSchema = new Schema(
  MCServer,
  {
    name: { type: "string" },
    url: { type: "string" },
    description: { type: "string" },
    addinf: { type: "array" },
  },
  {
    dataStructure: "JSON",
  }
);

module.exports.run = async (bot, message, args, db) => {
  await connect();
  let serverRepository = new Repository(MCServerSchema, client);
  try {
    await serverRepository.createIndex();
  } catch (e) {
    console.log("Index already exists");
  }
  let servers = await serverRepository.search().returnAll();

  servers.forEach((server) => {
    let embed = new Discord.MessageEmbed()
      .setColor("#6457A6")
      .setThumbnail("https://pbs.twimg.com/media/DHLaTWSUwAAfzqX.jpg")
      .setTitle(server.url)
      .setDescription(server.description)
      .setTimestamp()
      .setFooter(server.name);
    message.channel.send(embed);
  });
};

module.exports.help = {
  name: "mc",
};
