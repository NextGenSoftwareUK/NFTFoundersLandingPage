//import { kv } from "@vercel/kv";
const { createClient } = require("redis");

const redis = createClient({
  url: process.env.TEST_MODE === 'true' ? process.env.REDIS_URL_TEST : process.env.REDIS_URL,
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

export default async function handler(req, res) {
  const { orderId } = req.query;

  //const order = await kv.get(`order:${orderId}`);
  await ensureRedis();
  const order = await redis.get(`order:${orderId}`);

  if (!order) return res.status(404).json({ error: "Not found" });

  res.json(order);
}