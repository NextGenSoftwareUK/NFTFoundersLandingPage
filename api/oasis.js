const crypto = require("crypto");
const { createClient } = require("redis");
const { OASISClient } = require("@oasisomniverse/web4-api");

const redis = createClient({ url: process.env.REDIS_URL });

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

let redisReady = null;

async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

const ACTIVATION_PORTAL_URL = "https://portal.oasisomniverse.one/activate";
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

function buildWeb4NFT({ payload, mintResult, avatarId, email, createdNewAvatar }) {
  const minted = mintResult?.result || {};
  const primaryWeb3NFT = minted?.web3NFTs?.[0] || {};
  const now = new Date().toISOString();

  return {
    ...minted,
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
    console.log('Received mint request with payload:', JSON.stringify(payload));
    const testMode = process.env.TEST_MODE === 'true';

    const OASIS_CFG = {
      apiUrl: testMode ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE,
      username: process.env.OASIS_USERNAME,
      password: process.env.OASIS_PASSWORD,
      avatarId: process.env.OASIS_AVATAR_ID,
    };

    console.log('OASIS config:', JSON.stringify({ ...OASIS_CFG, password: '***' }));

    // =========================
    // 1. CREATE MINT LOCK
    // =========================

    lockKey = `mint-lock:${payload.SendToAddressAfterMinting}`;

    const lockResult = await redis.set(lockKey, "1", {
      NX: true,
      EX: 60 * 30
    });

    if (!lockResult) {
      return res.status(429).json({ error: "Mint already in progress" });
    }

    // =========================
    // 2. FETCH ORDER
    // =========================

    const orderRaw = await redis.get(`order:${payload.MetaData.orderId}`);

    if (!orderRaw) {
      return res.status(404).json({ error: "Order not found" });
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
      return res.status(403).json({ error: "Payment required" });
    }

    // =========================
    // 4. AUTHENTICATE OASIS (via SDK)
    // =========================

    const oasis = new OASISClient({ baseUrl: OASIS_CFG.apiUrl });

    const authRes = await oasis.auth.login({
      username: OASIS_CFG.username,
      password: OASIS_CFG.password
    });

    if (authRes.isError || !authRes.session?.jwtToken) {
      throw new Error(`OASIS auth failed: ${authRes.message || 'No JWT returned'}`);
    }

    console.log('OASIS authenticated, avatarId:', authRes.session.avatarId);

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
    payload.CollectionPublicKey = "BV3M26PqhztUpaXtesmYpG3EP2usWRYHL76QLiNWGEgs";
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
    // 7. MINT NFT (via SDK)
    // =========================

    const mintRes = await oasis.nft.mintNftAsync(payload);

    console.log('Mint response:', JSON.stringify(mintRes));

    if (mintRes.isError) {
      throw new Error(`OASIS mint failed: ${mintRes.message || 'Unknown error'}`);
    }

    const result = mintRes;

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

    if (recipientEmail) {
      try {
        // Lookup avatar by email via SDK
        const lookupRes = await oasis.avatar.getByEmail({ email: recipientEmail });
        const existingAvatar = (!lookupRes.isError && lookupRes.result) ? lookupRes.result : null;

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
              const regRes = await oasis.auth.register({
                username,
                email: recipientEmail,
                password,
                firstName: "Founder",
                lastName: "User",
                title: "Mx",
                avatarType: "User",
                acceptTerms: true
              });

              if (regRes.isError) throw new Error(regRes.message || 'Registration failed');

              avatar = regRes.result;
              tempPassword = password;
              verificationToken = avatar?.verificationToken || regRes.session?.verificationToken || null;
              break;
            } catch (regErr) {
              lastRegisterError = regErr;
              if (!/duplicate|exists|already/i.test(String(regErr?.message || regErr))) {
                throw regErr;
              }
            }
          }

          if (!avatar) {
            throw lastRegisterError || new Error("Avatar registration failed");
          }
        }

        const avatarId = avatar.avatarId || avatar.id || avatar.Id;
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

        const updateRequest = {
          id: web4NFT.id || result?.result?.id,
          mintedByAvatarId: avatarId,
          modifiedByAvatarId: avatarId,
          currentOwnerAvatarId: avatarId,
          previousOwnerAvatarId: payload.MintedByAvatarId,
          sendToAvatarAfterMintingId: avatarId,
          sendToAvatarAfterMintingUsername: recipientEmail,
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

        // Update Web4 NFT ownership via SDK
        const updateRes = await oasis.nft.updateWeb4NftAsync(updateRequest);

        console.log('Web4 NFT update response:', JSON.stringify(updateRes));

        if (updateRes?.result) {
          result.result = updateRes.result;
        }

        avatarProvision.createdNewAvatar = createdNewAvatar;
        avatarProvision.avatarId = avatarId;
        avatarProvision.linked = true;

        if (createdNewAvatar) {
          const activationKey = crypto.randomUUID();
          const activationUrl = buildActivationUrl({ email: recipientEmail, activationKey });

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
        }
      } catch (avatarErr) {
        console.warn("Avatar provisioning failed after mint:", avatarErr);
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
    order.oasisResponse = JSON.stringify(result);

    await redis.set(`order:${order.orderId}`, JSON.stringify(order));

    return res.status(200).json({
      success: true,
      result,
      avatarCreated: avatarProvision.createdNewAvatar,
      avatarId: avatarProvision.avatarId,
      activationUrl: avatarProvision.activationUrl,
      activationKey: avatarProvision.activationKey,
      avatarProvisionWarning: avatarProvision.warning
    });

  } catch (e) {

    console.error('OASIS handler error:', e);

    if (order && order.status === "minting" && !order.used) {
      order.status = "paid";
      await redis.set(`order:${order.orderId}`, JSON.stringify(order));
    }

    return res.status(500).json({ error: e.message || 'Unknown error' });

  } finally {

    try {
      if (lockKey) {
        await redis.del(lockKey);
        console.log('Mint lock released:', lockKey);
      }
    } catch (unlockErr) {
      console.error('Failed to release mint lock:', unlockErr);
    }
  }
}

/*
// ── ORIGINAL RAW-FETCH IMPLEMENTATION (kept for reference) ──────────────────

//import { kv } from '@vercel/kv';
// const crypto = require("crypto");
// const { createClient } = require("redis");
// const redis = createClient({ url: process.env.REDIS_URL });
//
// async function oasisJsonFetch(apiUrl, path, { method = "GET", token, body } = {}) {
//   const response = await fetch(`${apiUrl}${path}`, {
//     method,
//     headers: {
//       "Content-Type": "application/json",
//       "Accept": "application/json",
//       ...(token ? { Authorization: `Bearer ${token}` } : {})
//     },
//     body: body ? JSON.stringify(body) : undefined
//   });
//   const payload = await readResponseBody(response);
//   return { response, ...payload };
// }
//
// async function lookupAvatarByEmail({ apiUrl, token, email }) {
//   const { response, json, text } = await oasisJsonFetch(apiUrl, `/api/Avatar/get-by-email/${encodeURIComponent(email)}`, { token });
//   if (response.status === 404) return null;
//   if (!response.ok) {
//     const msg = json?.message || json?.error || text || `HTTP ${response.status}`;
//     if (/not found/i.test(msg)) return null;
//     throw new Error(`Avatar lookup failed (${response.status}): ${msg}`);
//   }
//   const avatar = extractAvatar(json);
//   if (avatar?.avatarId || avatar?.id) return avatar;
//   return null;
// }
//
// async function registerAvatar({ apiUrl, email, username, password }) { ... }
//
// Step 4 (old): raw fetch to /api/avatar/authenticate, extract JWT manually
// Step 7 (old): raw fetch to /api/nft/mint-nft
// Step 8 (old): raw fetch to /api/Nft/update-web4-nft
*/
