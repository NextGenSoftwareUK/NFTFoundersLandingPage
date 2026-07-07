const { createClient } = require("redis");

const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (err) => console.error("Redis error:", err));

let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

const CACHE_KEY = "eth:price:usd";
const CACHE_TTL = 60 * 30; // 30 mins

async function getEthPriceUSD() {
  await ensureRedis();

  const cached = await redis.get(CACHE_KEY);
  if (cached) return Number(cached);

  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
  );

  if (!res.ok) throw new Error("Failed to fetch ETH price");

  const data = await res.json();
  const price = data?.ethereum?.usd;
  if (!price) throw new Error("Invalid ETH price response");

  await redis.setEx(CACHE_KEY, CACHE_TTL, String(price));
  return Number(price);
}

module.exports = { getEthPriceUSD };
