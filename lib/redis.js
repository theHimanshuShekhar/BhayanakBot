let { Client, Entity, Schema, Repository } = require("redis-om");

const client = new Client();

async function connect() {
  if (!client.isOpen()) {
    try {
      await client.open(process.env.REDIS_URL);

      // Check connection to Redis
      client.execute(["PING"]).then((res) => {
        console.log(
          res === "PONG" ? "Connected to Redis" : "Failed to connect to Redis"
        );
      });

      return client;
    } catch (e) {
      console.log("Failed to connect to Redis");
      console.error(e);
    }
  }
}

module.exports = { connect };
