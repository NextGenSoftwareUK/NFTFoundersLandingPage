//import { kv } from '@vercel/kv';
//import { v4 as uuidv4 } from 'uuid';

const { createClient } = require("redis");
const crypto = require("crypto");

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { wallet, tier } = req.body;

    if (!wallet || !tier) {
      return res.status(400).json({ error: "Missing wallet or tier" });
    }

    const TIERS = {
      0: { priceSOL: 0.1 },
      1: { priceSOL: 0.25 },
      2: { priceSOL: 0.5 }
    };

    //const orderId = uuidv4();
    const orderId = crypto.randomUUID();
    const price = TIERS[tier]?.priceSOL;

    if (!price) {
      return res.status(400).json({ error: "Invalid tier" });
    }

    const order = {
      orderId,
      wallet,
      tier,
      price,
      status: "pending",
      used: false,
      createdAt: Date.now()
    };

    ensureRedis();
    await redis.set(`order:${orderId}`, JSON.stringify(order), { EX: 60 * 15 }); // 15 min expiry

    return res.status(200).json({ orderId, price });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}