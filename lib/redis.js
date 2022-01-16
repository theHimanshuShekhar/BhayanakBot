let { Client, Entity, Schema, Repository } = require("redis-om");

const client = new Client();

async function connect() {
  if (!client.isOpen()) {
    try {
      await client.open("redis://redis:6379");

      // Check connection to Redis
      client.execute(["PING"]).then((res) => {
        console.log(
          res === "PONG" ? "Connected to Redis" : "Failed to connect to Redis"
        );
      });
      await client.execute(["HSET", "foo", "bar", "baz", "qux", 42]);
    } catch (e) {
      console.log(e);
    }
  }
}

module.exports = { connect };
