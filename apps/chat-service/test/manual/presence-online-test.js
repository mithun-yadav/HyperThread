const Redis = require('ioredis');

const redis = new Redis('redis://localhost:6379');

const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node presence-online-test.js <USER_ID>');
  process.exit(1);
}

async function main() {
  const socketsKey = `presence:${userId}:sockets`;

  const now = Math.floor(Date.now() / 1000);

  await redis.zremrangebyscore(socketsKey, '-inf', now);

  const activeSockets = await redis.zcard(socketsKey);

  console.log('USER:', userId);
  console.log('ACTIVE SOCKETS:', activeSockets);
  console.log('ONLINE:', activeSockets > 0);

  await redis.quit();
}

void main();
