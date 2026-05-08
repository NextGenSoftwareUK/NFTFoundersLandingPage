import { kv } from "@vercel/kv";
import { getSolPriceUSD } from "../lib/solPrice";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { wallet, tier } = req.body;

  const TIERS = {
    0: 0.1,
    1: 0.25,
    2: 0.5
  };

  const priceSOL = TIERS[tier];
  if (!priceSOL) return res.status(400).json({ error: "Invalid tier" });

  const solPriceUSD = await getSolPriceUSD();
  const priceUSD = priceSOL * solPriceUSD;

  const lockId = uuidv4();

  const lock = {
    lockId,
    wallet,
    tier,
    priceSOL,
    solPriceUSD,
    priceUSD,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 min lock
  };

  await kv.set(`lock:${lockId}`, lock, { ex: 300 });

  return res.status(200).json(lock);
}