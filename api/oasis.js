//import { kv } from '@vercel/kv';
const crypto = require("crypto");
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

const ACTIVATION_PORTAL_URL = "https://oportal.oasisomniverse.one/activate";
const ACTIVATION_TTL_SECONDS = 60 * 60 * 24 * 7;

function randomString(length = 24) {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

function randomPassword(length = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function usernameFromEmail(email) {
  const local = String(email || "")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/[._-]+/g, "")
    .slice(0, 16) || "oasis";
  return `${local}-${randomString(6)}`;
}

async function readResponseBody(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function extractAvatar(data) {
  return data?.result?.result?.avatar
    || data?.result?.avatar
    || data?.avatar
    || data?.result
    || null;
}

function extractJwtToken(data) {
  return data?.result?.result?.jwtToken
    || data?.result?.jwtToken
    || data?.jwtToken
    || data?.token
    || null;
}

function extractVerificationToken(data, avatar) {
  return data?.result?.verificationToken
    || data?.result?.result?.verificationToken
    || data?.verificationToken
    || avatar?.verificationToken
    || null;
}

async function oasisJsonFetch(apiUrl, path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await readResponseBody(response);
  return { response, ...payload };
}

async function lookupAvatarByEmail({ apiUrl, token, email }) {
  const { response, json, text } = await oasisJsonFetch(apiUrl, `/api/Avatar/get-by-email/${encodeURIComponent(email)}`, {
    token
  });

  const lookupMsg = json?.result?.message || json?.message || '';
  console.log('[oasis] avatar lookup status:', response.status, 'isError:', json?.result?.isError, 'msg:', lookupMsg);

  if (response.status === 404) return null;
  if (json?.result?.isError) {
    if (/not found|unauthorized/i.test(lookupMsg)) return null;
    throw new Error(`Avatar lookup failed: ${lookupMsg}`);
  }
  if (!response.ok) {
    if (/not found/i.test(lookupMsg)) return null;
    throw new Error(`Avatar lookup failed (${response.status}): ${lookupMsg}`);
  }

  const avatar = extractAvatar(json);
  console.log('[oasis] avatar lookup extractAvatar:', JSON.stringify(avatar)?.slice(0, 200));
  if (avatar?.avatarId || avatar?.id) return avatar;

  return null;
}

async function registerAvatar({ apiUrl, email, username, password }) {
  const payload = {
    username,
    email,
    password,
    confirmPassword: password,
    firstName: "Founder",
    lastName: "User",
    title: "Mx",
    avatarType: "User",
    acceptTerms: true,
    privacyMode: false
  };

  const { response, json, text } = await oasisJsonFetch(apiUrl, "/api/Avatar/register", {
    method: "POST",
    body: payload
  });

  const registerMsg = json?.result?.message || json?.message || text || `HTTP ${response.status}`;
  console.log('[oasis] register response status:', response.status, 'isError:', json?.result?.isError, 'msg:', registerMsg);

  if (json?.result?.isError) {
    const err = new Error(`Avatar registration failed: ${registerMsg}`);
    err.alreadyExists = /already in use|already exists|duplicate/i.test(registerMsg);
    throw err;
  }
  if (!response.ok) {
    throw new Error(`Avatar registration failed (${response.status}): ${registerMsg}`);
  }

  const avatar = extractAvatar(json);
  const jwtToken = extractJwtToken(json);
  const verificationToken = extractVerificationToken(json, avatar);

  console.log('[oasis] extractAvatar result:', JSON.stringify(avatar)?.slice(0, 300));

  if (!avatar?.avatarId && !avatar?.id) {
    throw new Error("Avatar registration succeeded but no avatar ID was returned");
  }

  return {
    avatar,
    jwtToken,
    verificationToken,
    username,
    email,
    password
  };
}

function buildWeb4NFT({ payload, mintResult, avatarId, email, createdNewAvatar }) {
  const minted = mintResult?.result || {};
  const primaryWeb3NFT = minted?.web3NFTs?.[0] || {};
  const now = new Date().toISOString();

  return {
    ...minted,
    // The avatar-facing NFT queries key off MintedByAvatarId, so we re-home the record here.
    mintedByAvatarId: avatarId,
    modifiedByAvatarId: avatarId,
    sendToAvatarAfterMintingId: avatarId,
    sendToAvatarAfterMintingUsername: email,
    currentOwnerAvatarId: avatarId,
    lastPurchasedByAvatarId: avatarId,
    lastSoldByAvatarId: payload.MintedByAvatarId,
    title: payload.Title || minted.title || primaryWeb3NFT.title,
    description: payload.Description || minted.description || primaryWeb3NFT.description,
    symbol: payload.Symbol || minted.symbol || primaryWeb3NFT.symbol,
    onChainProvider: payload.OnChainProvider,
    offChainProvider: payload.OffChainProvider,
    nftStandardType: payload.NFTStandardType,
    nftOffChainMetaType: payload.NFTOffChainMetaType,
    jsonMetaDataURL: payload.JSONMetaDataURL || payload.JsonMetaDataURL || minted.jsonMetaDataURL || primaryWeb3NFT.jsonMetaDataURL,
    imageUrl: payload.ImageUrl || payload.imageUrl || minted.imageUrl || primaryWeb3NFT.imageUrl,
    thumbnailUrl: payload.ThumbnailUrl || payload.thumbnailUrl || minted.thumbnailUrl || primaryWeb3NFT.thumbnailUrl,
    metaData: {
      ...(minted.metaData || {}),
      ...(payload.MetaData || {}),
      email,
      mintingAvatarId: payload.MintedByAvatarId,
      linkedAvatarId: avatarId,
      createdNewAvatar,
      mintTransactionHash: primaryWeb3NFT.mintTransactionHash || minted.mintTransactionHash || null,
      sendNFTTransactionHash: primaryWeb3NFT.sendNFTTransactionHash || minted.sendNFTTransactionHash || null
    },
    tags: Array.from(new Set([...(minted.tags || []), ...(primaryWeb3NFT.tags || []), "founder", "web4", createdNewAvatar ? "activation-required" : "existing-avatar"])),
    importedOn: now,
    modifiedOn: now,
    mintedOn: minted.mintedOn || primaryWeb3NFT.mintedOn || now
  };
}

async function updateWeb4NFT({ apiUrl, token, providerType, nft }) {
  const providerQuery = providerType ? `?providerType=${encodeURIComponent(providerType)}` : "";
  const { response, json, text } = await oasisJsonFetch(apiUrl, `/api/Nft/update-web4-nft${providerQuery}`, {
    method: "POST",
    token,
    body: nft
  });

  if (!response.ok) {
    const msg = json?.message || json?.error || text || `HTTP ${response.status}`;
    throw new Error(`Web4 NFT update failed (${response.status}): ${msg}`);
  }

  return json;
}

async function storeActivationRecord({ email, username, activationKey, avatarId, verificationToken, tempPassword, testMode }) {
  const record = {
    email,
    username,
    activationKey,
    avatarId,
    verificationToken,
    tempPassword,
    testMode,
    createdAt: Date.now()
  };

  await redis.set(`avatar-activation:${activationKey}`, JSON.stringify(record), {
    EX: ACTIVATION_TTL_SECONDS
  });

  return record;
}

function buildActivationUrl({ email, activationKey }) {
  const url = new URL(ACTIVATION_PORTAL_URL);
  url.searchParams.set("email", email);
  url.searchParams.set("key", activationKey);
  return url.toString();
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
    console.log('Received mint request — orderId:', payload?.MetaData?.orderId, 'wallet:', payload?.SendToAddressAfterMinting);
    const testMode = process.env.TEST_MODE === 'true';

    const OASIS_CFG = {
      apiUrl:   testMode ? process.env.OASIS_API_URL_TEST   : process.env.OASIS_API_URL_LIVE,
      username: testMode ? process.env.OASIS_AVATAR_USERNAME_TEST  : process.env.OASIS_AVATAR_USERNAME_LIVE,
      password: testMode ? process.env.OASIS_AVATAR_PASSWORD_TEST  : process.env.OASIS_AVATAR_PASSWORD_LIVE,
      avatarId: testMode ? process.env.OASIS_AVATAR_ID_TEST        : process.env.OASIS_AVATAR_ID_LIVE,
      imageUrl: process.env.OASIS_IMAGE_URL,
    };

    console.log('OASIS config:', JSON.stringify(OASIS_CFG));

    // =========================
    // 1. CREATE MINT LOCK
    // =========================

    // lockKey = `mint-lock:${payload.SendToAddressAfterMinting}`;
    // const lockResult = await redis.set(lockKey, "1", { NX: true, EX: testMode ? 60 * 5 : 60 * 30 });
    // if (!lockResult) return res.status(429).json({ error: "Mint already in progress" });
    console.log('[oasis] step 1: mint lock skipped (disabled for testing)');

    // =========================
    // 2. FETCH ORDER
    // =========================

    console.log('[oasis] step 2: fetching order', payload.MetaData?.orderId);
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

    console.log('[oasis] step 2: order status:', order.status, 'used:', order.used, 'email:', order.email);

    // =========================
    // 3. VERIFY PAYMENT
    // =========================

    console.log('[oasis] step 3: verifying payment');
    if (!order || order.status !== "paid" || order.used) {
      return res.status(403).json({
        error: "Payment required"
      });
    }

    // =========================
    // 4. AUTHENTICATE OASIS
    // =========================

    console.log('[oasis] step 4: authenticating with OASIS as', OASIS_CFG.username, 'at', OASIS_CFG.apiUrl);
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
    console.log('[oasis] step 4: auth token obtained:', !!token);

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
    payload.CollectionPublicKey = testMode
      ? (process.env.COLLECTION_PUBLIC_KEY_TEST || "BV3M26PqhztUpaXtesmYpG3EP2usWRYHL76QLiNWGEgs")
      : (process.env.COLLECTION_PUBLIC_KEY_LIVE || "BV3M26PqhztUpaXtesmYpG3EP2usWRYHL76QLiNWGEgs");

    console.log('[oasis] testMode:', testMode);
    console.log('[oasis] apiUrl:', OASIS_CFG.apiUrl);
    console.log('[oasis] CollectionPublicKey:', payload.CollectionPublicKey);

    // Force server-side values
    payload.MintedByAvatarId = OASIS_CFG.avatarId;
    console.log('[oasis] step 5: payload prepared — OnChainProvider:', payload.OnChainProvider, 'MintedByAvatarId:', payload.MintedByAvatarId);

    console.log('[oasis] step 5: Title:', payload.Title, 'Provider:', payload.OnChainProvider, 'Standard:', payload.NFTStandardType);

    // =========================
    // 6. MARK ORDER MINTING
    // =========================

    console.log('[oasis] step 6: marking order as minting');
    order.status = "minting";
    await redis.set(`order:${order.orderId}`, JSON.stringify(order));

    // =========================
    // 7. MINT NFT
    // =========================

    console.log('[oasis] step 7: calling mint-nft API');
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
    console.log('[oasis] step 7: raw mint response (first 500):', mintText?.slice(0, 500));

    let result;

    try {
      result = JSON.parse(mintText);
    } catch (e) {
      throw new Error(`Failed to parse OASIS mint response: ${e.message}`);
    }

    console.log('[oasis] step 7: mint complete — isError:', result?.isError, 'result id:', result?.result?.id, 'web3NFTs count:', result?.result?.web3NFTs?.length);
    if (result?.isError) {
      throw new Error(result.message || 'OASIS returned an error');
    }

    // =========================
    // 8. RESOLVE AVATAR + LINK WEB4 NFT
    // =========================

    const recipientEmail = String(order.email || payload.MetaData?.email || "").trim();
    const avatarProvision = {
      createdNewAvatar: false,
      avatarId: null,
      activationUrl: null,
      activationKey: null,
      warning: null,
      linked: false
    };

    console.log('[oasis] step 8: recipientEmail:', recipientEmail);

    if (recipientEmail) {
      try {
        const existingAvatar = await lookupAvatarByEmail({
          apiUrl: OASIS_CFG.apiUrl,
          token,
          email: recipientEmail
        });

        console.log('[oasis] existingAvatar:', existingAvatar ? (existingAvatar.avatarId || existingAvatar.id) : 'not found');

        let avatar = existingAvatar;
        let tempPassword = null;
        let verificationToken = null;
        let createdNewAvatar = false;

        if (!avatar) {
          createdNewAvatar = true;
          const baseUsername = usernameFromEmail(recipientEmail);

          let lastRegisterError = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const password = randomPassword(20);
            const username = attempt === 0 ? baseUsername : `${baseUsername}-${attempt + 1}`;

            try {
              const registration = await registerAvatar({
                apiUrl: OASIS_CFG.apiUrl,
                email: recipientEmail,
                username,
                password
              });

              avatar = registration.avatar;
              tempPassword = registration.password;
              verificationToken = registration.verificationToken;
              break;
            } catch (regErr) {
              lastRegisterError = regErr;
              if (regErr.alreadyExists) {
                // Email belongs to existing user we can't look up — stop retrying
                console.log('[oasis] email already exists, cannot register or look up — skipping avatar link');
                break;
              }
              if (!/duplicate|exists|already/i.test(String(regErr?.message || regErr))) {
                throw regErr;
              }
            }
          }

          if (!avatar) {
            throw lastRegisterError || new Error("Avatar registration failed");
          }
        }

        const avatarId = avatar.avatarId || avatar.id;
        console.log('[oasis] avatarId:', avatarId, 'createdNewAvatar:', createdNewAvatar);
        if (!avatarId) {
          throw new Error("Avatar ID missing after lookup/registration");
        }

        const web4NFT = buildWeb4NFT({
          payload,
          mintResult: result,
          avatarId,
          email: recipientEmail,
          createdNewAvatar
        });

        console.log('[oasis] updateWeb4NFT id:', web4NFT.id || result?.result?.id);
        const updateRequest = {
          id: web4NFT.id || result?.result?.id,
          mintedByAvatarId: avatarId,
          modifiedByAvatarId: avatarId,
          currentOwnerAvatarId: avatarId,
          previousOwnerAvatarId: payload.MintedByAvatarId,
          title: web4NFT.title,
          description: web4NFT.description,
          imageUrl: web4NFT.imageUrl,
          thumbnailUrl: web4NFT.thumbnailUrl,
          metaData: web4NFT.metaData,
          tags: web4NFT.tags,
          price: web4NFT.price,
          discount: web4NFT.discount,
          royaltyPercentage: web4NFT.royaltyPercentage,
          lastSoldByAvatarId: payload.MintedByAvatarId,
          lastPurchasedByAvatarId: avatarId,
          providerType: payload.OffChainProvider
        };

        const updatedWeb4NFT = await updateWeb4NFT({
          apiUrl: OASIS_CFG.apiUrl,
          token,
          providerType: payload.OffChainProvider,
          nft: updateRequest
        });

        console.log('[oasis] updateWeb4NFT response:', JSON.stringify(updatedWeb4NFT)?.slice(0, 300));
        if (updatedWeb4NFT?.result) {
          result.result = updatedWeb4NFT.result;
        }

        avatarProvision.createdNewAvatar = createdNewAvatar;
        avatarProvision.avatarId = avatarId;
        avatarProvision.linked = true;
        console.log('[oasis] step 8: NFT linked to avatar', avatarId, '— createdNewAvatar:', createdNewAvatar);

        if (createdNewAvatar) {
          const activationKey = crypto.randomUUID();
          const activationUrl = buildActivationUrl({
            email: recipientEmail,
            activationKey
          });

          await storeActivationRecord({
            email: recipientEmail,
            username: avatar?.username || null,
            activationKey,
            avatarId,
            verificationToken,
            tempPassword,
            testMode
          });

          avatarProvision.activationKey = activationKey;
          avatarProvision.activationUrl = activationUrl;
          console.log('[oasis] step 8: activation record stored, url:', activationUrl);
        }
      } catch (avatarErr) {
        console.error('[oasis] Avatar provisioning failed:', avatarErr?.message || avatarErr);
        avatarProvision.warning = avatarErr?.message || String(avatarErr);
      }
    }

    // =========================
    // 9. SAVE SUCCESS
    // =========================

    order.used = true;
    order.status = "minted";
    order.mintedAt = Date.now();

    order.mintTx = result?.result?.web3NFTs?.[0]?.mintTransactionHash || null;
    order.sendTx = result?.result?.web3NFTs?.[0]?.sendNFTTransactionHash || null;

    order.paymentSignature = payload.MetaData.paymentSignature || null;
    order.email = payload.MetaData.email || null;
    order.avatarId = avatarProvision.avatarId || null;
    order.avatarCreated = avatarProvision.createdNewAvatar;
    order.avatarActivationKey = avatarProvision.activationKey || null;
    order.avatarActivationUrl = avatarProvision.activationUrl || null;
    order.avatarProvisionWarning = avatarProvision.warning || null;

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
      result,
      avatarCreated: avatarProvision.createdNewAvatar,
      avatarId: avatarProvision.avatarId,
      activationUrl: avatarProvision.activationUrl,
      activationKey: avatarProvision.activationKey,
      avatarProvisionWarning: avatarProvision.warning,
      _debug: { testMode, apiUrl: OASIS_CFG.apiUrl, collectionPublicKey: payload.CollectionPublicKey }
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
      error: e.message || 'Unknown error',
      _debug: {
        testMode: process.env.TEST_MODE,
        apiUrl: process.env.TEST_MODE === 'true' ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE,
        collectionPublicKey: process.env.TEST_MODE === 'true' ? process.env.COLLECTION_PUBLIC_KEY_TEST : process.env.COLLECTION_PUBLIC_KEY_LIVE,
        username: process.env.TEST_MODE === 'true' ? process.env.OASIS_AVATAR_USERNAME_TEST : process.env.OASIS_AVATAR_USERNAME_LIVE,
        avatarId: process.env.TEST_MODE === 'true' ? process.env.OASIS_AVATAR_ID_TEST : process.env.OASIS_AVATAR_ID_LIVE,
        passwordSet: !!(process.env.TEST_MODE === 'true' ? process.env.OASIS_AVATAR_PASSWORD_TEST : process.env.OASIS_AVATAR_PASSWORD_LIVE)
      }
    });

  } finally {

    try {

      // if (lockKey) { await redis.del(lockKey); }

    } catch (unlockErr) 
    {
      console.error(
        'Failed to release mint lock:',
        unlockErr
      );
    }
  }
}
