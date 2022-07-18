let { Client, Entity, Schema, Repository } = require("redis-om");

// Connect to Redis
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

// Create message schema
class Message extends Entity {}
let messageSchema = new Schema(
  Message,
  {
    message_id: { type: "string" },
    author_name: { type: "string", textSearch: true },
    author_id: { type: "string", textSearch: true },
    content: { type: "string", textSearch: true },
    createdTimestamp: { type: "number" },
    guild_name: { type: "string", textSearch: true },
    guild_id: { type: "string", textSearch: true },
    channel_id: { type: "string", textSearch: true },
    channel_name: { type: "string", textSearch: true },
  },
  {
    dataStructure: "JSON",
  }
);

// log message in database
module.exports.logMessage = async (message) => {
  await connect();
  let messageRepository = new Repository(messageSchema, client);
  let msg = messageRepository.createEntity();
  msg.entityId = message.id;
  msg.content = message.cleanContent;
  msg.message_id = message.id;
  msg.author_name = message.author.username;
  msg.author_id = message.author.id;
  msg.createdTimestamp = message.createdTimestamp;
  msg.guild_name = message.guild.name;
  msg.guild_id = message.guild.id;
  msg.channel_id = message.channel.id;
  msg.channel_name = message.channel.name;
  let id = await messageRepository.save(msg);

  client.close();
};
