import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', () => {});
let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

const MINT_LIMITS = { genesis: 20, core: 50, supporter: 100 };

export default async function handler(req, res) {
  const testMode = process.env.TEST_MODE === 'true';

  let mintCounts = { genesis: 0, core: 0, supporter: 0 };
  try {
    await ensureRedis();
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
      ETH:  process.env.USDT_ETH_TEST,
      BNB:  process.env.USDT_BNB_TEST,
      MATIC: process.env.USDT_MATIC_TEST,
    } : {
      ETH:  process.env.USDT_ETH_LIVE,
      BNB:  process.env.USDT_BNB_LIVE,
      MATIC: process.env.USDT_MATIC_LIVE,
    },
    oasis: {
      apiUrl:  testMode ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE,
      imageUrl: process.env.OASIS_IMAGE_URL,
    },
    mintCounts,
    mintLimits: MINT_LIMITS,
  });
}
