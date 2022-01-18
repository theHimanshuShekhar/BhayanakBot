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

const ngrok = require("ngrok");
const mc_port = 25565;

module.exports.ngrok_runner = async () => {
  ngrok
    .connect({
      proto: "tcp",
      addr: mc_port,
      region: "in",
      authtoken: process.env.NGROK_TOKEN,
    })
    .then(async (url) => {
      await connect();
      let serverRepository = new Repository(MCServerSchema, client);
      let server = serverRepository.createEntity();

      server.entityId = "Valhelsia3";
      server.name = "Bhayanak Valhelsia";
      server.url = url;
      server.description = "Valhelsia 3 modded minecraft server";
      server.addinf = [
        "check Bhayanak general channel pinned comments for installation steps",
      ];
      await serverRepository.save(server);

      console.log(`${server.name}:  ${url}`);

      client.close();
    })
    .catch((reason) => console.info(reason));
};
