// ============================================================
// DEAD CODE — NOT USED
// No frontend callers. Was an early price-locking approach
// before the current SOL order flow (create-sol-order.js)
// was adopted. getSolPriceUSD import also uncommented but
// the function call was never wired up. Do not delete until
// confirmed safe.
// ============================================================

// // import { kv } from "@vercel/kv";
// // import { getSolPriceUSD } from "../lib/solPrice";
// // import { v4 as uuidv4 } from "uuid";
//
// const crypto = require("crypto");
// const { verifySolPayment } = require("../lib/verifySolTx");
// const { createClient } = require("redis");
//
// const TEST_MODE = process.env.TEST_MODE === 'true';
// const P = TEST_MODE ? 'test:' : '';
// const redis = createClient({
//   url: process.env.REDIS_URL,
//   socket: { reconnectStrategy: false },
// });
//
// redis.on("error", (err) => {
//   console.error("Redis error:", err);
// });
//
// let redisReady = null;
//
// async function ensureRedis() {
//   if (!redisReady) {
//     redisReady = redis.connect();
//   }
//   return redisReady;
// }
//
// export default async function handler(req, res) {
//   if (req.method !== "POST") return res.status(405).end();
//
//   const { wallet, tier } = req.body;
//
//   const TIERS = {
//     0: 0.1,
//     1: 0.25,
//     2: 0.5
//   };
//
//   const priceSOL = TIERS[tier];
//   if (!priceSOL) return res.status(400).json({ error: "Invalid tier" });
//
//   const solPriceUSD = await getSolPriceUSD();
//   const priceUSD = priceSOL * solPriceUSD;
//
//   const lockId = crypto.randomUUID();
//
//   const lock = {
//     lockId,
//     wallet,
//     tier,
//     priceSOL,
//     solPriceUSD,
//     priceUSD,
//     expiresAt: Date.now() + 5 * 60 * 1000
//   };
//
//   await ensureRedis();
//   await redis.set(`${P}lock:${lockId}`, JSON.stringify(lock), { EX: 300 });
//
//   return res.status(200).json(lock);
// }
