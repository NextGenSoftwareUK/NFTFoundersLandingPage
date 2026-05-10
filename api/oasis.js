//import { kv } from '@vercel/kv';

const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

let redisReady = null;

async function ensureRedis() {
  if (!redisReady) {
    redisReady = redis.connect();
  }

  return redisReady;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const testMode = process.env.TEST_MODE === 'true';

  const OASIS_CFG = {
    apiUrl: testMode
      ? process.env.OASIS_API_URL_TEST
      : process.env.OASIS_API_URL_LIVE,

    username: process.env.OASIS_USERNAME,
    password: process.env.OASIS_PASSWORD,
    avatarId: process.env.OASIS_AVATAR_ID,
    imageUrl: process.env.OASIS_IMAGE_URL,
  };

  let lockKey = null;

  try {

    const { payload } = req.body;
    console.log('Received mint request with payload:', JSON.stringify(payload));
    await ensureRedis();

    lockKey = `mint-lock:${payload.SendToAddressAfterMinting}`;
    const locked = await redis.get(lockKey);

    if (locked) {
      return res.status(429).json({
        error: "Mint already in progress"
      });
    }

    // Create temporary mint lock
    await redis.set(lockKey, "1");

    // 30 minute expiry
    await redis.expire(lockKey, 60 * 30);

    // Fetch order
    const orderRaw = await redis.get(
      `order:${payload.MetaData.orderId}`
    );

    if (!orderRaw) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    const order = JSON.parse(orderRaw);
    console.log('Fetched order from Redis:', order);

    // Verify payment
    if (!order || order.status !== "paid" || order.used) {
      return res.status(403).json({
        error: "Payment required"
      });
    }

    // =========================
    // 1. Authenticate
    // =========================

    const authRes = await fetch(
      `${OASIS_CFG.apiUrl}/api/avatar/authenticate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: OASIS_CFG.username,
          password: OASIS_CFG.password
        })
      }
    );

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

    const token =
      authData?.result?.result?.jwtToken ??
      authData?.result?.jwtToken;

    if (!token) {
      throw new Error('No JWT token in OASIS auth response');
    }

    // =========================
    // 2. Prepare mint payload
    // =========================

    payload.OnChainProvider =
      typeof payload.OnChainProvider === 'object'
        ? payload.OnChainProvider.name
        : String(payload.OnChainProvider);

    payload.NFTStandardType =
      typeof payload.NFTStandardType === 'object'
        ? payload.NFTStandardType.name
        : String(payload.NFTStandardType);

    payload.OffChainProvider =
      typeof payload.OffChainProvider === 'object'
        ? payload.OffChainProvider.name
        : String(payload.OffChainProvider);

    payload.NFTOffChainMetaType = 'ExternalJSONURL';

    // Force server-side values
    payload.MintedByAvatarId = OASIS_CFG.avatarId;
    payload.Price = order.priceSOL;

    console.log('Minting with payload:', JSON.stringify({
      Title: payload.Title,
      OnChainProvider: payload.OnChainProvider,
      NFTStandardType: payload.NFTStandardType,
      OffChainProvider: payload.OffChainProvider,
      NFTOffChainMetaType: payload.NFTOffChainMetaType,
      SendToAddress: payload.SendToAddressAfterMinting,
    }));

    // =========================
    // 3. Mint NFT
    // =========================

    const mintRes = await fetch(
      `${OASIS_CFG.apiUrl}/api/nft/mint-nft`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      }
    );

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
    // 4. Mark order used
    // =========================

    order.used = true;
    order.status = "minted";

    await redis.set(
      `order:${order.orderId}`,
      JSON.stringify(order)
    );

    await redis.expire(
      `order:${order.orderId}`,
      60 * 60 * 24
    );

    return res.status(200).json({
      success: true,
      result
    });

  } catch (e) {

    console.error('OASIS handler error:', e);

    return res.status(500).json({
      error: e.message || 'Unknown error'
    });

  } finally {

    try {

      if (lockKey) {
        await redis.del(lockKey);
        console.log('Mint lock released:', lockKey);
      }

    } catch (unlockErr) {

      console.error(
        'Failed to release mint lock:',
        unlockErr
      );
    }
  }
}

// //import { kv } from '@vercel/kv';

// const { createClient } = require("redis");

// const redis = createClient({
//   url: process.env.REDIS_URL,
// });

// redis.on("error", (err) => {
//   console.error("Redis error:", err);
// });

// let redisReady = null;

// async function ensureRedis() {
//   if (!redisReady) {
//     redisReady = redis.connect();
//   }

//   return redisReady;
// }


// export default async function handler(req, res) {
//   if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

//   const testMode = process.env.TEST_MODE === 'true';
//   const OASIS_CFG = {
//     apiUrl:   testMode ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE,
//     username: process.env.OASIS_USERNAME,
//     password: process.env.OASIS_PASSWORD,
//     avatarId: process.env.OASIS_AVATAR_ID,
//     imageUrl: process.env.OASIS_IMAGE_URL,
//   };

//    const { payload } = req.body;
//    console.log('Received mint request with payload:', JSON.stringify(payload));

//   await ensureRedis();
//   const lockKey = `mint-lock:${payload.SendToAddressAfterMinting}`;
//   const locked = await redis.get(lockKey);

//   if (locked) {
//     return res.status(429).json({ error: "Mint already in progress" });
//   }

//   // set lock (30 sec safety window)
//   //await redis.set(lockKey, true, { ex: 30 });
//   await redis.set(lockKey, "1");
//   await redis.expire(lockKey, 60 * 30);  //30 mins

//   //const { wallet } = req.body.payload.MetaData;

//   const orderRaw = await redis.get(
//     `order:${payload.MetaData.orderId}`
//   );

//   const order = JSON.parse(orderRaw);
//   console.log('Fetched order from Redis:', order);

//   if (!order || order.status !== "paid" || order.used) 
//   {
//     await redis.del(lockKey);
//     return res.status(403).json({ error: "Payment required" });
//   }

//   try {
//     // 1. Authenticate
//     const authRes = await fetch(`${OASIS_CFG.apiUrl}/api/avatar/authenticate`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ username: OASIS_CFG.username, password: OASIS_CFG.password })
//     });
//     if (!authRes.ok) 
//     {
//       await redis.del(lockKey);
//       throw new Error(`OASIS auth failed: ${authRes.status}`);
//     }

//     const authText = await authRes.text();
//     let authData;
    
//     try {
//       authData = JSON.parse(authText);
//     } catch(e) {
//       await redis.del(lockKey);
//       throw new Error(`Failed to parse OASIS auth response: ${e.message}`);
//     }

//     // NOW check for errors with full context
//     if (!authRes.ok || authData?.result?.isError) {
//       const msg = authData?.result?.message || `OASIS auth failed: ${authRes.status}`;
//       await redis.del(lockKey);
//       throw new Error(`OASIS authentication failed: ${msg}`);
//     }

//     const token = authData?.result?.result?.jwtToken ?? authData?.result?.jwtToken;

//     if (!token) 
//     {
//       await redis.del(lockKey);
//       throw new Error('No JWT token in OASIS auth response');
//     }


//     // 2. Build mint payload — use raw values not objects
//     console.log('Received JSONUrl:', payload.JSONUrl);

//     // Force numeric values for provider fields
//     // Force string values for provider fields
//     payload.OnChainProvider     = typeof payload.OnChainProvider     === 'object' ? payload.OnChainProvider.name     : String(payload.OnChainProvider);
//     payload.NFTStandardType     = typeof payload.NFTStandardType     === 'object' ? payload.NFTStandardType.name     : String(payload.NFTStandardType);
//     payload.OffChainProvider    = typeof payload.OffChainProvider    === 'object' ? payload.OffChainProvider.name    : String(payload.OffChainProvider);
//     payload.NFTOffChainMetaType = 'ExternalJSONURL'

//     // Safety: always force server-side values, never trust client
//     payload.MintedByAvatarId = OASIS_CFG.avatarId;
//     // payload.ImageUrl         = OASIS_CFG.imageUrl;
//     // payload.ThumbnailUrl     = OASIS_CFG.imageUrl;
//     payload.Price            = order.priceSOL; //TODO: Not sure if the sc already charges the wallet?! How do we check?

//     console.log('Minting with payload:', JSON.stringify({
//       Title:              payload.Title,
//       OnChainProvider:    payload.OnChainProvider,
//       NFTStandardType:    payload.NFTStandardType,
//       OffChainProvider:   payload.OffChainProvider,
//       NFTOffChainMetaType: payload.NFTOffChainMetaType,
//       SendToAddress:      payload.SendToAddressAfterMinting,
//       JSONUrl:            payload.JSONUrl,
//     }));

//     // 3. Mint
//     const mintRes = await fetch(`${OASIS_CFG.apiUrl}/api/nft/mint-nft`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
//       body: JSON.stringify(payload)
//     });

//     if (!mintRes.ok) {
//       const errText = await mintRes.text();
//       await redis.del(lockKey);
//       throw new Error(`OASIS mint failed (${mintRes.status}): ${errText.slice(0, 500)}`);
//     }

//     const mintText = await mintRes.text();
//     console.log('Mint response length:', mintText.length);
//     console.log('Mint response:', mintText);

//     let result;
//     try {
//       result = JSON.parse(mintText);
//     } catch(e) {
//       await redis.del(lockKey);
//       throw new Error(`Failed to parse OASIS mint response: ${e.message}`);
//     }

//     if (result?.isError) throw new Error(result.message || 'OASIS returned an error');

//     // paidOrder.used = true;
//     // await kv.set(`order:${paidOrder.orderId}`, paidOrder);

//     order.used = true;
//     order.status = "minted";
//     //await redis.set(lockKey, true, { ex: 30 });
//     await redis.set(
//       `order:${order.orderId}`,
//       JSON.stringify(order)
//     );

//     await redis.del(lockKey);
//     return res.status(200).json({ success: true, result });

//   } catch (e) {
//     console.error('OASIS handler error:', e.message);
//     return res.status(500).json({ error: e.message || 'Unknown error' });
//   }
// }