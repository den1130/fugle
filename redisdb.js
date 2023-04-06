const { createClient } = require('redis');
const redisClient = createClient({ url: 'redis://127.0.0.1'});

async function connectToRedis() {
  await redisClient.connect();
}

module.exports = {
  redisClient,
  connectToRedis,
}