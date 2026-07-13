const { createClient } = require("redis");
const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (err) => console.error("Redis error:", err));
let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

export default async function handler(req, res) {
  // Only allow in test mode
  if (process.env.TEST_MODE !== 'true') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'wallet query param required' });

  await ensureRedis();
  const key = `mint-lock:${wallet}`;
  const existed = await redis.del(key);
  console.log('[clear-mint-lock] deleted', key, '— existed:', existed);
  return res.status(200).json({ deleted: existed > 0, key });
}
