const crypto = require("crypto");
const { createClient } = require("redis");
const { getEthPriceUSD } = require("../lib/ethPrice");

const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (err) => console.error("Redis error:", err));

let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { wallet, tier, chain } = req.body;

    if (!wallet || !tier || !chain) {
      return res.status(400).json({ error: "Missing wallet, tier or chain" });
    }

    const TIERS = {
      supporter: { priceUSD: 149 },
      core:      { priceUSD: 499 },
      genesis:   { priceUSD: 1499 }
    };

    const VALID_CHAINS = ["ERC721", "ArbitrumOASIS"];

    if (!TIERS[tier]) return res.status(400).json({ error: "Invalid tier" });
    if (!VALID_CHAINS.includes(chain)) return res.status(400).json({ error: "Invalid chain" });

    const priceUSD = TIERS[tier].priceUSD;
    const ethPriceUSD = await getEthPriceUSD();
    const priceETH = Number((priceUSD / ethPriceUSD).toFixed(6));

    const orderId = crypto.randomUUID();

    const order = {
      type: "evm",
      orderId,
      wallet,
      tier,
      chain,
      priceUSD,
      priceETH,
      ethPriceUSD,
      status: "pending",
      used: false,
      createdAt: Date.now()
    };

    await ensureRedis();
    await redis.set(`order:${orderId}`, JSON.stringify(order), { EX: 60 * 15 });

    return res.status(200).json({ orderId, priceUSD, priceETH });

  } catch (err) {
    console.error("create-evm-order error:", err);
    return res.status(500).json({ error: err.message });
  }
};
