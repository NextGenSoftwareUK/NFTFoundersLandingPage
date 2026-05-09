// import { kv } from '@vercel/kv';
// import { v4 as uuidv4 } from 'uuid';
// import { rateLimit } from "../lib/rateLimit";
//import { getSolPriceUSD } from "../lib/solPrice";

const { kv } = require("@vercel/kv");
//const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { rateLimit } = require("../lib/rateLimit");
const { getSolPriceUSD } = require("../lib/solPrice");

//export default async function handler(req, res) {
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { wallet, tier } = req.body;

    if (!wallet || tier === undefined) {
      return res.status(400).json({ error: "Missing wallet or tier" });
    }

    if (!(await rateLimit(wallet))) {
      return res.status(429).json({ error: "Too many requests" });
    }

    // 💰 Tier prices are in USD
    const TIERS = {
      0: { priceUSD: 149 },
      1: { priceUSD: 499 },
      2: { priceUSD: 1499 }
    };

    const tierData = TIERS[tier];

    if (!tierData) {
      return res.status(400).json({ error: "Invalid tier" });
    }

    const priceUSD = tierData.priceUSD;

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

    await kv.set(`order:${orderId}`, order, { ex: 60 * 15 });

    return res.status(200).json({
      orderId,
      priceUSD,
      priceSOL
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}