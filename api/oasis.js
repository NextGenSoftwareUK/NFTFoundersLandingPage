//import { kv } from '@vercel/kv';
const { createClient } = require("redis");
const redis = createClient({ url: process.env.REDIS_URL });

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

let redisReady = null;

async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let order = null;
  let lockKey = null;

  try {

    await ensureRedis();
    const { payload } = req.body;
    console.log('Received mint request with payload:', JSON.stringify(payload));
    const testMode = process.env.TEST_MODE === 'true';

    const OASIS_CFG = {
      apiUrl: testMode ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE,
      username: process.env.OASIS_USERNAME,
      password: process.env.OASIS_PASSWORD,
      avatarId: process.env.OASIS_AVATAR_ID,
      imageUrl: process.env.OASIS_IMAGE_URL,
    };

    // =========================
    // 1. CREATE MINT LOCK
    // =========================

    lockKey = `mint-lock:${payload.SendToAddressAfterMinting}`;

    const lockResult = await redis.set(lockKey, "1", {
      NX: true,
      EX: 60 * 30 // 30 mins
    });

    if (!lockResult) {
      return res.status(429).json({
        error: "Mint already in progress"
      });
    }

    // =========================
    // 2. FETCH ORDER
    // =========================

    const orderRaw = await redis.get(`order:${payload.MetaData.orderId}`);

    if (!orderRaw) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    try {
      order = JSON.parse(orderRaw);
    } catch {
      throw new Error("Invalid order data");
    }

    console.log('Fetched order from Redis:', order);

    // =========================
    // 3. VERIFY PAYMENT
    // =========================

    if (!order || order.status !== "paid" || order.used) {
      return res.status(403).json({
        error: "Payment required"
      });
    }

    // =========================
    // 4. AUTHENTICATE OASIS
    // =========================

    const authRes = await fetch(`${OASIS_CFG.apiUrl}/api/avatar/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: OASIS_CFG.username,
        password: OASIS_CFG.password
      })
    });

    if (!authRes.ok) {
      throw new Error(`OASIS auth failed: ${authRes.status}`);
    }

    const authText = await authRes.text();

    let authData;

    try {
      authData = JSON.parse(authText);
    } catch (e) {
      throw new Error(`Failed to parse OASIS auth response: ${e.message}`);
    }

    if (authData?.result?.isError) {
      const msg = authData?.result?.message || 'OASIS authentication failed';
      throw new Error(msg);
    }

    const token = authData?.result?.result?.jwtToken ?? authData?.result?.jwtToken;

    if (!token) {
      throw new Error('No JWT token in OASIS auth response');
    }

    // =========================
    // 5. PREPARE PAYLOAD
    // =========================

    payload.OnChainProvider = typeof payload.OnChainProvider === 'object'
      ? payload.OnChainProvider.name
      : String(payload.OnChainProvider);

    payload.NFTStandardType = typeof payload.NFTStandardType === 'object'
      ? payload.NFTStandardType.name
      : String(payload.NFTStandardType);

    payload.OffChainProvider = typeof payload.OffChainProvider === 'object'
      ? payload.OffChainProvider.name
      : String(payload.OffChainProvider);

    payload.NFTOffChainMetaType = 'ExternalJSONURL';

    // Force server-side values
    payload.MintedByAvatarId = OASIS_CFG.avatarId;

    console.log('Minting with payload:', JSON.stringify({
      Title: payload.Title,
      OnChainProvider: payload.OnChainProvider,
      NFTStandardType: payload.NFTStandardType,
      OffChainProvider: payload.OffChainProvider,
      NFTOffChainMetaType: payload.NFTOffChainMetaType,
      SendToAddress: payload.SendToAddressAfterMinting,
    }));

    // =========================
    // 6. MARK ORDER MINTING
    // =========================

    order.status = "minting";

    await redis.set(`order:${order.orderId}`, JSON.stringify(order));

    // =========================
    // 7. MINT NFT
    // =========================

    const mintRes = await fetch(`${OASIS_CFG.apiUrl}/api/nft/mint-nft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!mintRes.ok) {
      const errText = await mintRes.text();

      throw new Error(
        `OASIS mint failed (${mintRes.status}): ${errText.slice(0, 500)}`
      );
    }

    const mintText = await mintRes.text();
    console.log('Mint response:', mintText);

    let result;

    try {
      result = JSON.parse(mintText);
    } catch (e) {
      throw new Error(`Failed to parse OASIS mint response: ${e.message}`);
    }

    if (result?.isError) {
      throw new Error(result.message || 'OASIS returned an error');
    }

    // =========================
    // 8. SAVE SUCCESS
    // =========================

    order.used = true;
    order.status = "minted";
    order.mintedAt = Date.now();

    order.mintTx = result?.result?.web3NFTs?.[0]?.mintTransactionHash || null;
    order.sendTx = result?.result?.web3NFTs?.[0]?.sendNFTTransactionHash || null;

    order.paymentSignature = payload.MetaData.paymentSignature || null;
    order.email = payload.MetaData.email || null;

    order.lockReleasedAt = Date.now();
    order.oasisResponse = mintText;

    // Optional debug snapshot
    // order.oasisResponse = {
    //   success: true,
    //   mintTx: order.mintTx,
    //   sendTx: order.sendTx
    // };

    await redis.set(`order:${order.orderId}`, JSON.stringify(order));

    return res.status(200).json({
      success: true,
      result
    });

  } catch (e) {

    console.error('OASIS handler error:', e);

    // Rollback minting state if mint failed
    if (order && order.status === "minting" && !order.used) {

      order.status = "paid";

      await redis.set(
        `order:${order.orderId}`,
        JSON.stringify(order)
      );
    }

    return res.status(500).json({
      error: e.message || 'Unknown error'
    });

  } finally {

    try {

      if (lockKey) {
        await redis.del(lockKey);
        console.log('Mint lock released:', lockKey);
      }

    } catch (unlockErr) 
    {
      console.error(
        'Failed to release mint lock:',
        unlockErr
      );
    }
  }
}