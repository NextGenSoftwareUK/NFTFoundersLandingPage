import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const testMode = process.env.TEST_MODE === 'true';
  const OASIS_CFG = {
    apiUrl:   testMode ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE,
    username: process.env.OASIS_USERNAME,
    password: process.env.OASIS_PASSWORD,
    avatarId: process.env.OASIS_AVATAR_ID,
    imageUrl: process.env.OASIS_IMAGE_URL,
  };

  const lockKey = `mint-lock:${payload.MetaData.wallet}`;
  const locked = await kv.get(lockKey);

  if (locked) {
    return res.status(429).json({ error: "Mint already in progress" });
  }

  // set lock (30 sec safety window)
  await kv.set(lockKey, true, { ex: 30 });

  const { wallet } = req.body.payload.MetaData;

  const order = await kv.get(`order:${payload.MetaData.orderId}`);

  if (!order || order.status !== "paid" || order.used) {
    return res.status(403).json({ error: "Payment required" });
  }

  // const orders = await kv.scan(0, {
  //   match: "order:*"
  // });

  // const paidOrder = orders[1]
  //   .map(o => JSON.parse(o))
  //   .find(o => o.wallet === wallet && o.status === "paid" && !o.used);

  // if (!paidOrder) {
  //   return res.status(403).json({ error: "Payment required" });
  // }


  try {
    // 1. Authenticate
    const authRes = await fetch(`${OASIS_CFG.apiUrl}/api/avatar/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: OASIS_CFG.username, password: OASIS_CFG.password })
    });
    if (!authRes.ok) throw new Error(`OASIS auth failed: ${authRes.status}`);

    const authText = await authRes.text();
    let authData;
    
    try {
      authData = JSON.parse(authText);
    } catch(e) {
      throw new Error(`Failed to parse OASIS auth response: ${e.message}`);
    }

    // NOW check for errors with full context
    if (!authRes.ok || authData?.result?.isError) {
      const msg = authData?.result?.message || `OASIS auth failed: ${authRes.status}`;
      throw new Error(`OASIS authentication failed: ${msg}`);
    }

    const token = authData?.result?.result?.jwtToken ?? authData?.result?.jwtToken;

    if (!token) throw new Error('No JWT token in OASIS auth response');


    // 2. Build mint payload — use raw values not objects
    const { payload } = req.body;

    console.log('Received JSONUrl:', payload.JSONUrl);

    // Force numeric values for provider fields
    // Force string values for provider fields
    payload.OnChainProvider     = typeof payload.OnChainProvider     === 'object' ? payload.OnChainProvider.name     : String(payload.OnChainProvider);
    payload.NFTStandardType     = typeof payload.NFTStandardType     === 'object' ? payload.NFTStandardType.name     : String(payload.NFTStandardType);
    payload.OffChainProvider    = typeof payload.OffChainProvider    === 'object' ? payload.OffChainProvider.name    : String(payload.OffChainProvider);
    payload.NFTOffChainMetaType = 'ExternalJSONURL'

    // Safety: always force server-side values, never trust client
    payload.MintedByAvatarId = OASIS_CFG.avatarId;
    // payload.ImageUrl         = OASIS_CFG.imageUrl;
    // payload.ThumbnailUrl     = OASIS_CFG.imageUrl;
    payload.Price            = 0;

    console.log('Minting with payload:', JSON.stringify({
      Title:              payload.Title,
      OnChainProvider:    payload.OnChainProvider,
      NFTStandardType:    payload.NFTStandardType,
      OffChainProvider:   payload.OffChainProvider,
      NFTOffChainMetaType: payload.NFTOffChainMetaType,
      SendToAddress:      payload.SendToAddressAfterMinting,
      JSONUrl:            payload.JSONUrl,
    }));

    // 3. Mint
    const mintRes = await fetch(`${OASIS_CFG.apiUrl}/api/nft/mint-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });

    if (!mintRes.ok) {
      const errText = await mintRes.text();
      throw new Error(`OASIS mint failed (${mintRes.status}): ${errText.slice(0, 500)}`);
    }

    const mintText = await mintRes.text();
    console.log('Mint response length:', mintText.length);
    console.log('Mint response:', mintText);

    let result;
    try {
      result = JSON.parse(mintText);
    } catch(e) {
      throw new Error(`Failed to parse OASIS mint response: ${e.message}`);
    }

    if (result?.isError) throw new Error(result.message || 'OASIS returned an error');

    // paidOrder.used = true;
    // await kv.set(`order:${paidOrder.orderId}`, paidOrder);

    order.used = true;
    order.status = "minted";
    await kv.set(`order:${order.orderId}`, order);

    await kv.del(`mint-lock:${payload.MetaData.wallet}`);

    return res.status(200).json({ success: true, result });

  } catch (e) {
    console.error('OASIS handler error:', e.message);
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}