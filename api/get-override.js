import { createClient } from 'redis';

const TEST_MODE = process.env.TEST_MODE === 'true';
const P = TEST_MODE ? 'test:' : '';

const redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false } });
redis.on('error', e => console.error('[redis]', e.message));
let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  const email = (req.query.email || '').toLowerCase().trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });

  try { await ensureRedis(); } catch (e) {
    return res.status(503).json({ error: 'Redis unavailable' });
  }

  const raw = await redis.get(`${P}waitlist:meta:${email}`);
  if (!raw) return res.json({ overrides: null });

  try {
    return res.json({ overrides: JSON.parse(raw) });
  } catch {
    return res.json({ overrides: null });
  }
}
