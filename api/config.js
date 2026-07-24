import { createClient } from 'redis';
import crypto from 'crypto';

const redis = createClient({ url: process.env.TEST_MODE === 'true' ? process.env.REDIS_URL_TEST : process.env.REDIS_URL });
redis.on('error', () => {});
let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

const MINT_LIMITS = { genesis: 20, core: 50, supporter: 100 };

function safeEqual(a, b) {
  try {
    const ab = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  await ensureRedis();

  // ── Admin POST ──
  if (req.method === 'POST') {
    const { password } = req.body || {};
    const adminPw = process.env.ADMIN_PASSWORD;
    if (!adminPw) return res.status(500).json({ error: 'ADMIN_PASSWORD env var not set' });
    if (!safeEqual(password, adminPw)) return res.status(401).json({ error: 'Unauthorized' });

    const [g, c, s] = await Promise.all([
      redis.get('mint_count:genesis'),
      redis.get('mint_count:core'),
      redis.get('mint_count:supporter'),
    ]);
    const mintCounts = {
      genesis:   parseInt(g || '0'),
      core:      parseInt(c || '0'),
      supporter: parseInt(s || '0'),
    };

    const waitlistEmails = await redis.sMembers('waitlist:emails');

    const orderKeys = await redis.keys('order:*');

    let orders = [];
    if (orderKeys.length) {
      const rawOrders = await redis.mGet(orderKeys);
      for (const raw of rawOrders) {
        if (raw) { try { orders.push(JSON.parse(raw)); } catch {} }
      }
    }
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return res.json({
      mintCounts,
      limits: MINT_LIMITS,
      waitlist: { count: waitlistEmails.length, emails: waitlistEmails.slice().sort() },
      orders,
    });
  }

  // ── Public GET ──
  const testMode = process.env.TEST_MODE === 'true';
  let mintCounts = { genesis: 0, core: 0, supporter: 0 };
  try {
    const [genesis, core, supporter] = await Promise.all([
      redis.get('mint_count:genesis'),
      redis.get('mint_count:core'),
      redis.get('mint_count:supporter'),
    ]);
    mintCounts = {
      genesis:   parseInt(genesis   || '0', 10),
      core:      parseInt(core      || '0', 10),
      supporter: parseInt(supporter || '0', 10),
    };
  } catch (e) {
    console.warn('mint-counts fetch failed:', e.message);
  }

  res.status(200).json({
    testMode,
    stripePk: testMode ? process.env.STRIPE_PK_TEST : process.env.STRIPE_PK_LIVE,
    evmReceiver: process.env.EVM_RECEIVER,
    btcAddr: process.env.BTC_ADDR,
    solAddr: process.env.TREASURY_WALLET_SOL,
    usdtContracts: testMode ? {
      ETH:   process.env.USDT_ETH_TEST,
      BNB:   process.env.USDT_BNB_TEST,
      MATIC: process.env.USDT_MATIC_TEST,
    } : {
      ETH:   process.env.USDT_ETH_LIVE,
      BNB:   process.env.USDT_BNB_LIVE,
      MATIC: process.env.USDT_MATIC_LIVE,
    },
    oasis: {
      apiUrl:   testMode ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE,
      imageUrl: process.env.OASIS_IMAGE_URL,
    },
    mintCounts,
    mintLimits: MINT_LIMITS,
  });
}
