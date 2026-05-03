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

  try {
    // 1. Authenticate
    const authRes = await fetch(`${OASIS_CFG.apiUrl}/api/avatar/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: OASIS_CFG.username, password: OASIS_CFG.password })
    });
    if (!authRes.ok) throw new Error(`OASIS auth failed: ${authRes.status}`);
    const authData = await authRes.json();
    console.log('OASIS auth response:', JSON.stringify(authData));
    const token = authData?.result?.jwtToken;
    if (!token) throw new Error('No JWT token in OASIS auth response');

    // 2. Mint
    const { payload } = req.body;

    // Safety: always force server-side values, never trust client
    payload.MintedByAvatarId = OASIS_CFG.avatarId;
    payload.ImageUrl         = OASIS_CFG.imageUrl;
    payload.ThumbnailUrl     = OASIS_CFG.imageUrl;
    payload.Price            = 0;

    const mintRes = await fetch(`${OASIS_CFG.apiUrl}/api/nft/mint-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (!mintRes.ok) {
      const errText = await mintRes.text();
      throw new Error(`OASIS mint failed (${mintRes.status}): ${errText.slice(0, 200)}`);
    }
    const result = await mintRes.json();
    if (result?.isError) throw new Error(result.message || 'OASIS returned an error');

    return res.status(200).json({ success: true, result });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}