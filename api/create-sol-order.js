// import { kv } from '@vercel/kv';
// import { v4 as uuidv4 } from 'uuid';
// import { rateLimit } from "../lib/rateLimit";
//import { getSolPriceUSD } from "../lib/solPrice";

//const { kv } = require("@vercel/kv");
//const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
// const { rateLimit } = require("../lib/rateLimit"); // DEAD — rate limiting never wired up, call site is commented out
const { getSolPriceUSD } = require("../lib/solPrice");
const { createClient } = require("redis");

const TEST_MODE = process.env.TEST_MODE === 'true';
const P = TEST_MODE ? 'test:' : '';
const redis = createClient({
  url: process.env.REDIS_URL,
  socket: { reconnectStrategy: false },
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



//export default async function handler(req, res) {
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { wallet, tier, email } = req.body;

    if (!wallet || tier === undefined) {
      return res.status(400).json({ error: "Missing wallet or tier" });
    }

    // if (!(await rateLimit(wallet))) {
    //   return res.status(429).json({ error: "Too many requests" });
    // }

    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        error: "Invalid wallet"
      });
    }

    console.log("Creating order for wallet:", wallet, "tier:", tier);

    // 💰 Tier prices are in USD
    const TIERS = {
      supporter: { priceUSD: 149 },
      core: { priceUSD: 499 },
      genesis: { priceUSD: 1499 }
    };

    const tierData = TIERS[tier];

    if (!tierData) {
      return res.status(400).json({ error: "Invalid tier" });
    }

    let priceUSD = tierData.priceUSD;

    // Apply per-email price override if set
    if (email) {
      try {
        await ensureRedis();
        const raw = await redis.get(`${P}waitlist:meta:${email.toLowerCase().trim()}`);
        if (raw) {
          const meta = JSON.parse(raw);
          const notExpired = !meta.expiresAt || meta.expiresAt >= Date.now();
          if (notExpired) {
            const op = meta[`${tier}Price`];
            if (op !== null && op !== undefined && op > 0) {
              priceUSD = op;
            }
            // op === 0 = free gift — should use /api/gift-order instead
          }
        }
      } catch (e) {
        console.warn('[sol-order override-lookup]', e.message);
      }
    }

    // 🔥 realtime SOL price in USD (1 SOL = X USD)
    const solPriceUSD = await getSolPriceUSD();

    if (!solPriceUSD) {
      return res.status(500).json({ error: "Unable to fetch SOL price" });
    }

    // 🧠 Convert USD → SOL (THIS is the correct direction for minting)
    const priceSOL = Number((priceUSD / solPriceUSD).toFixed(4));
    //const orderId = uuidv4();
    const orderId = crypto.randomUUID();

    const order = {
      type: "sol",
      orderId,
      wallet,
      tier,
      priceUSD,
      priceSOL,
      solPriceUSD,
      status: "pending",
      used: false,
      createdAt: Date.now()
    };

    ensureRedis();
    await redis.set(`${P}order:${orderId}`, JSON.stringify(order), { EX: 60 * 15 }); //expire after 15 mins.

    return res.status(200).json({
      orderId,
      priceUSD,
      priceSOL
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}