//import { kv } from "@vercel/kv";
const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

let redisReady = null;

async function ensureRedis() {
  if (!redisReady) {
    redisReady = redis.connect();
  }

  return redisReady;
}


export async function rateLimit(wallet) {
  const key = `rl:${wallet}`;

  ensureRedis();
  const hits = (await redis.get(key)) || 0;

  if (hits > 5) {
    return false;
  }

  await redis.set(key, hits + 1, { EX: 60 }); // 1 min window

  return true;
}