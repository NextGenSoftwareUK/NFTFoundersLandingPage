import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', () => {});
let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

const LIMITS = { genesis: 20, core: 50, supporter: 100 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    await ensureRedis();
    const [genesis, core, supporter] = await Promise.all([
      redis.get('mint_count:genesis'),
      redis.get('mint_count:core'),
      redis.get('mint_count:supporter'),
    ]);
    const counts = {
      genesis:   parseInt(genesis   || '0', 10),
      core:      parseInt(core      || '0', 10),
      supporter: parseInt(supporter || '0', 10),
    };
    res.status(200).json({ counts, limits: LIMITS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
