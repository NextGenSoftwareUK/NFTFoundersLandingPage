import { createClient } from 'redis';
import crypto from 'crypto';

const TEST_MODE = process.env.TEST_MODE === 'true';
const P = TEST_MODE ? 'test:' : ''; // key prefix — keeps dev/live data separate in same Redis

const redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false } });
redis.on('error', (e) => console.error('[redis]', e.message));
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
  try { await ensureRedis(); } catch (e) {
    return res.status(503).json({ error: 'Redis connection failed' });
  }

  // ── Admin POST ──
  if (req.method === 'POST') {
    const { password, action, namespace } = req.body || {};
    const adminPw = process.env.ADMIN_PASSWORD;
    if (!adminPw) return res.status(500).json({ error: 'ADMIN_PASSWORD env var not set' });
    if (!safeEqual(password, adminPw)) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'reset-counts') {
      await Promise.all([
        redis.set(`${P}mint_count:genesis`, '0'),
        redis.set(`${P}mint_count:core`, '0'),
        redis.set(`${P}mint_count:supporter`, '0'),
      ]);
      return res.json({ success: true, message: 'Mint counts reset to 0' });
    }

    if (action === 'add-emails') {
      const { emails } = req.body;
      if (!Array.isArray(emails) || !emails.length) return res.status(400).json({ error: 'No emails provided' });
      const valid = [...new Set(
        emails.map(e => String(e).trim().toLowerCase()).filter(e => e.includes('@') && e.length < 255)
      )].slice(0, 1000);
      if (valid.length) await redis.sAdd(`${P}waitlist:emails`, valid);
      const total = await redis.sCard(`${P}waitlist:emails`);
      return res.json({ success: true, added: valid.length, total });
    }

    if (action === 'set-override') {
      const { email, genesisPrice, corePrice, supporterPrice, expiresAt } = req.body;
      if (!email) return res.status(400).json({ error: 'email required' });
      const key = email.toLowerCase().trim();
      const meta = {};
      const toNum = v => (v === '' || v === null || v === undefined) ? null : Number(v);
      if (genesisPrice !== undefined) meta.genesisPrice = toNum(genesisPrice);
      if (corePrice !== undefined) meta.corePrice = toNum(corePrice);
      if (supporterPrice !== undefined) meta.supporterPrice = toNum(supporterPrice);
      if (expiresAt) meta.expiresAt = Number(expiresAt);
      await redis.set(`${P}waitlist:meta:${key}`, JSON.stringify(meta));
      return res.json({ success: true });
    }

    if (action === 'remove-override') {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'email required' });
      await redis.del(`${P}waitlist:meta:${email.toLowerCase().trim()}`);
      return res.json({ success: true });
    }

    if (action === 'remove-waitlist-email') {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'email required' });
      const key = email.toLowerCase().trim();
      await redis.sRem(`${P}waitlist:emails`, key);
      await redis.del(`${P}waitlist:meta:${key}`);
      return res.json({ success: true });
    }

    if (action === 'reset-all') {
      await Promise.all([
        redis.set(`${P}mint_count:genesis`, '0'),
        redis.set(`${P}mint_count:core`, '0'),
        redis.set(`${P}mint_count:supporter`, '0'),
      ]);
      const orderKeys = await redis.keys(`${P}order:*`);
      if (orderKeys.length) await redis.del(orderKeys);
      const lockKeys = await redis.keys(`${P}lock:*`);
      if (lockKeys.length) await redis.del(lockKeys);
      return res.json({ success: true, message: `Mint counts reset and ${orderKeys.length} orders deleted` });
    }

    // Determine the prefix used for reading data (supports archived: namespace in test mode)
    const VALID_NS = ['test', 'archived'];
    const RP = (TEST_MODE && namespace && VALID_NS.includes(namespace))
      ? `${namespace}:`
      : P;

    const [g, c, s] = await Promise.all([
      redis.get(`${RP}mint_count:genesis`),
      redis.get(`${RP}mint_count:core`),
      redis.get(`${RP}mint_count:supporter`),
    ]);
    const mintCounts = {
      genesis:   parseInt(g || '0'),
      core:      parseInt(c || '0'),
      supporter: parseInt(s || '0'),
    };

    const waitlistEmails = await redis.sMembers(`${RP}waitlist:emails`);

    // Cap mGet to 500 emails to avoid pulling unbounded data into heap
    const EMAIL_CAP = 500;
    const emailsForMeta = waitlistEmails.slice(0, EMAIL_CAP);
    let overrides = {};
    if (emailsForMeta.length > 0) {
      const metaVals = await redis.mGet(emailsForMeta.map(e => `${RP}waitlist:meta:${e}`));
      emailsForMeta.forEach((e, i) => {
        if (metaVals[i]) try { overrides[e] = JSON.parse(metaVals[i]); } catch {}
      });
    }

    const orderKeys = await redis.keys(`${RP}order:*`);

    // Cap order fetch to 500 to avoid pulling the full order history into heap
    const ORDERS_CAP = 500;
    const keysToFetch = orderKeys.length > ORDERS_CAP ? orderKeys.slice(0, ORDERS_CAP) : orderKeys;
    let orders = [];
    if (keysToFetch.length) {
      const rawOrders = await redis.mGet(keysToFetch);
      for (const raw of rawOrders) {
        if (raw) { try { orders.push(JSON.parse(raw)); } catch {} }
      }
    }
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return res.json({
      testMode: TEST_MODE,
      namespace: RP.replace(/:$/, '') || 'live',
      mintCounts,
      limits: MINT_LIMITS,
      waitlist: { count: waitlistEmails.length, emails: emailsForMeta.slice().sort(), overrides, truncated: waitlistEmails.length > EMAIL_CAP },
      orders,
      orderCount: orderKeys.length,
      ordersTruncated: orderKeys.length > ORDERS_CAP,
    });
  }

  // ── Public GET ──

  // ?email=... — return per-email price overrides (replaces /api/get-override)
  if (req.query.email) {
    const email = String(req.query.email).toLowerCase().trim();
    if (!email.includes('@')) return res.status(400).json({ error: 'valid email required' });
    const raw = await redis.get(`${P}waitlist:meta:${email}`);
    if (!raw) return res.json({ overrides: null });
    try {
      const meta = JSON.parse(raw);
      if (meta.expiresAt && meta.expiresAt < Date.now()) return res.json({ overrides: null });
      return res.json({ overrides: meta });
    } catch { return res.json({ overrides: null }); }
  }

  let mintCounts = { genesis: 0, core: 0, supporter: 0 };
  try {
    const [genesis, core, supporter] = await Promise.all([
      redis.get(`${P}mint_count:genesis`),
      redis.get(`${P}mint_count:core`),
      redis.get(`${P}mint_count:supporter`),
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
    testMode: TEST_MODE,
    stripePk: TEST_MODE ? process.env.STRIPE_PK_TEST : process.env.STRIPE_PK_LIVE,
    evmReceiver: process.env.EVM_RECEIVER,
    btcAddr: process.env.BTC_ADDR,
    solAddr: process.env.TREASURY_WALLET_SOL,
    usdtContracts: TEST_MODE ? {
      ETH:   process.env.USDT_ETH_TEST,
      BNB:   process.env.USDT_BNB_TEST,
      MATIC: process.env.USDT_MATIC_TEST,
    } : {
      ETH:   process.env.USDT_ETH_LIVE,
      BNB:   process.env.USDT_BNB_LIVE,
      MATIC: process.env.USDT_MATIC_LIVE,
    },
    oasis: {
      imageUrl: process.env.OASIS_IMAGE_URL,
    },
    mintCounts,
    mintLimits: MINT_LIMITS,
  });
}
