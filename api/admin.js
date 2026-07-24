const { createClient } = require("redis");
const crypto = require("crypto");

const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", err => console.error("[admin] Redis error:", err));
let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

function safeEqual(a, b) {
  try {
    const ab = Buffer.from(String(a), "utf8");
    const bb = Buffer.from(String(b), "utf8");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

const LIMITS = { genesis: 20, core: 50, supporter: 100 };

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") return res.status(405).end();

  const { password } = req.body || {};
  const adminPw = process.env.ADMIN_PASSWORD;

  if (!adminPw) {
    return res.status(500).json({ error: "ADMIN_PASSWORD env var not set" });
  }
  if (!safeEqual(password, adminPw)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await ensureRedis();

    // Mint counts
    const [g, c, s] = await Promise.all([
      redis.get("mint_count:genesis"),
      redis.get("mint_count:core"),
      redis.get("mint_count:supporter"),
    ]);

    const mintCounts = {
      genesis:   parseInt(g || "0"),
      core:      parseInt(c || "0"),
      supporter: parseInt(s || "0"),
    };

    // Waitlist
    const waitlistEmails = await redis.sMembers("waitlist:emails");

    // Scan for all orders
    const orderKeys = [];
    let cursor = 0;
    do {
      const result = await redis.scan(cursor, { MATCH: "order:*", COUNT: 200 });
      cursor = result.cursor;
      orderKeys.push(...result.keys);
    } while (cursor !== 0);

    let orders = [];
    if (orderKeys.length) {
      const rawOrders = await redis.mGet(orderKeys);
      for (const raw of rawOrders) {
        if (raw) {
          try { orders.push(JSON.parse(raw)); } catch {}
        }
      }
    }
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return res.json({
      mintCounts,
      limits: LIMITS,
      waitlist: {
        count: waitlistEmails.length,
        emails: waitlistEmails.slice().sort(),
      },
      orders,
    });
  } catch (err) {
    console.error("[admin]", err);
    return res.status(500).json({ error: err.message });
  }
};
