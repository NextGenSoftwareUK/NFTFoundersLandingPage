import { createClient } from 'redis';
import crypto from 'crypto';

const TEST_MODE = process.env.TEST_MODE === 'true';
const P = TEST_MODE ? 'test:' : '';

const redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false } });
redis.on('error', e => console.error('[redis]', e.message));
let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

const MINT_LIMITS    = { genesis: 20,   core: 50,  supporter: 100 };
const DEFAULT_PRICES = { genesis: 1499, core: 499, supporter: 149 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { email, tier, wallet, name } = req.body || {};
  if (!email || !tier || !MINT_LIMITS[tier])
    return res.status(400).json({ error: 'email and valid tier required' });

  try { await ensureRedis(); } catch (e) {
    return res.status(503).json({ error: 'Redis unavailable' });
  }

  const normalEmail = email.toLowerCase().trim();

  // Validate override exists
  const raw = await redis.get(`${P}waitlist:meta:${normalEmail}`);
  if (!raw) return res.status(403).json({ error: 'No price override on file for this email' });

  let meta;
  try { meta = JSON.parse(raw); } catch {
    return res.status(500).json({ error: 'Corrupt override data' });
  }

  const overridePrice = meta[`${tier}Price`];
  if (overridePrice === null || overridePrice === undefined)
    return res.status(403).json({ error: `No price override set for ${tier} tier` });

  // Check mint limit
  const count = parseInt(await redis.get(`${P}mint_count:${tier}`) || '0', 10);
  if (count >= MINT_LIMITS[tier])
    return res.status(409).json({ error: 'This tier is sold out' });

  const orderId = crypto.randomBytes(8).toString('hex');
  const order = {
    orderId,
    tier,
    type: 'gift',
    status: 'paid',
    email: normalEmail,
    name: name || null,
    wallet: wallet || null,
    priceUSD: overridePrice,
    originalPriceUSD: DEFAULT_PRICES[tier],
    priceOverride: true,
    createdAt: Date.now(),
    paidAt: Date.now(),
    testMode: TEST_MODE,
  };

  await Promise.all([
    redis.incr(`${P}mint_count:${tier}`),
    redis.set(`${P}order:${orderId}`, JSON.stringify(order)),
  ]);

  return res.json({ success: true, orderId, priceUSD: overridePrice });
}
