const crypto = require("crypto");
const { createClient } = require("redis");
const { OASISClient } = require("@oasisomniverse/web4-api");

const TEST_MODE = process.env.TEST_MODE === 'true';
const P = TEST_MODE ? 'test:' : '';

async function resendWithRetry(payload, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) return res;
    const body = await res.text();
    lastErr = `Resend error (${res.status}): ${body}`;
    console.warn(`[oasis] Resend attempt ${attempt} failed: ${lastErr}`);
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 2000 * attempt));
  }
  throw new Error(lastErr);
}

// ── Redis (transactional data: orders, mint counts, locks, waitlists) ──
const redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false } });
redis.on("error", (err) => console.error("Redis error:", err.message));
let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

// ── OASIS Web4 SDK (module-level singleton, reused across warm invocations) ──
let _oasisClient = null;
function getOasisClient() {
  if (!_oasisClient) {
    const baseUrl = TEST_MODE ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE;
    console.log('[oasis] OASIS_API_URL:', baseUrl, '| TEST_MODE:', TEST_MODE);
    _oasisClient = new OASISClient({ baseUrl });
  }
  return _oasisClient;
}

async function ensurePlatformAuth(oasis) {
  const username = TEST_MODE ? process.env.OASIS_AVATAR_USERNAME_TEST : process.env.OASIS_AVATAR_USERNAME_LIVE;
  const password = TEST_MODE ? process.env.OASIS_AVATAR_PASSWORD_TEST : process.env.OASIS_AVATAR_PASSWORD_LIVE;
  console.log('[oasis] authenticating platform user:', username);
  const res = await oasis.auth.login({ username, password });
  if (res.isError || !res.session?.jwtToken) {
    throw new Error(`OASIS auth failed: ${res.message || 'no JWT token returned'}`);
  }
  console.log('[oasis] platform auth ok, avatarId:', res.session.avatarId);
}

const ACTIVATION_PORTAL_URL = TEST_MODE
  ? "https://dev.oportal.oasisomniverse.one/activate.html"
  : "https://oportal.oasisomniverse.one/activate.html";
const ACTIVATION_TTL_SECONDS = 60 * 60 * 24 * 30;

function randomString(length = 24) {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

function randomPassword(length = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
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

async function lookupAvatarByEmail(oasis, email) {
  const res = await oasis.avatar.getByEmail({ email });
  if (res.statusCode === 404) return null;
  if (res.isError) {
    const msg = res.message || '';
    if (/not found|unauthorized|does not exist|failed to load/i.test(msg)) return null;
    throw new Error(`Avatar lookup failed: ${msg}`);
  }
  const avatar = res.result;
  if (avatar?.avatarId || avatar?.id) return avatar;
  return null;
}

async function registerBuyerAvatar(oasis, { email, username, password }) {
  // Use raw oasis.avatar.register() — NOT oasis.auth.register() — so the
  // platform session token in tokenStore is not replaced with the buyer's token.
  const res = await oasis.avatar.register({
    Title: 'Mx',
    FirstName: 'Founder',
    LastName: 'User',
    Email: email,
    Username: username,
    Password: password,
    ConfirmPassword: password,
    AvatarType: 'User',
    AcceptTerms: true,
    SuppressVerificationEmail: true,
  });

  if (res.isError) {
    const err = new Error(`Avatar registration failed: ${res.message}`);
    err.alreadyExists = /already in use|already exists|duplicate/i.test(res.message || '');
    throw err;
  }

  const avatar = res.result;
  if (!avatar?.avatarId && !avatar?.id) {
    throw new Error("Avatar registration succeeded but no avatar ID was returned");
  }

  // verificationToken may sit at different depths depending on OASIS version
  const verificationToken =
    res.raw?.result?.verificationToken ||
    res.raw?.result?.result?.verificationToken ||
    avatar?.verificationToken ||
    null;

  return { avatar, verificationToken, password };
}

async function verifyAvatarEmail(oasis, token) {
  // Correct per API spec: GET /api/avatar/verify-email?token={token}
  const res = await oasis.avatar.verifyEmail({ token });
  if (res.isError) throw new Error(`Email verification failed: ${res.message}`);
  return res;
}

async function storeActivationRecord({ email, username, activationKey, avatarId, verificationToken, tempPassword, testMode }) {
  const record = { email, username, activationKey, avatarId, verificationToken, tempPassword, testMode, createdAt: Date.now() };
  await redis.set(`${P}avatar-activation:${activationKey}`, JSON.stringify(record), { EX: ACTIVATION_TTL_SECONDS });
  return record;
}

function buildActivationUrl({ email, activationKey }) {
  const url = new URL(ACTIVATION_PORTAL_URL);
  url.searchParams.set("email", email);
  url.searchParams.set("key", activationKey);
  return url.toString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let order = null;

  try {
    await ensureRedis();
    const { payload } = req.body;
    console.log('[oasis] VERSION: 2026-07-26-web4sdk | testMode:', process.env.TEST_MODE);
    console.log('[oasis] mint request — orderId:', payload?.MetaData?.orderId, 'wallet:', payload?.SendToAddressAfterMinting);
    const testMode = process.env.TEST_MODE === 'true';

    const platformAvatarId = testMode ? process.env.OASIS_AVATAR_ID_TEST : process.env.OASIS_AVATAR_ID_LIVE;

    // =========================
    // 1. OASIS SDK AUTH
    // =========================
    const oasis = getOasisClient();
    await ensurePlatformAuth(oasis);

    // =========================
    // 2. FETCH ORDER
    // =========================
    console.log('[oasis] step 2: fetching order', payload.MetaData?.orderId);
    const orderRaw = await redis.get(`${P}order:${payload.MetaData.orderId}`);
    if (!orderRaw) return res.status(404).json({ error: "Order not found" });
    try { order = JSON.parse(orderRaw); } catch { throw new Error("Invalid order data"); }
    console.log('[oasis] step 2: order status:', order.status, 'used:', order.used, 'email:', order.email);

    // =========================
    // 3. VERIFY PAYMENT
    // =========================
    if (!order || order.status !== "paid" || order.used) {
      return res.status(403).json({ error: "Payment required" });
    }

    // =========================
    // 4. PREPARE PAYLOAD
    // =========================
    payload.OnChainProvider = typeof payload.OnChainProvider === 'object' ? payload.OnChainProvider.name : String(payload.OnChainProvider);
    payload.NFTStandardType  = typeof payload.NFTStandardType  === 'object' ? payload.NFTStandardType.name  : String(payload.NFTStandardType);
    payload.OffChainProvider    = 'MongoDBOASIS';
    payload.NFTOffChainMetaType = 'ExternalJSONURL';
    payload.CollectionPublicKey = testMode
      ? (process.env.COLLECTION_PUBLIC_KEY_TEST || "32QH9iMunepwzMCvSDoHvwxUFFmCB92bsDGjCzjNZxtY")
      : (process.env.COLLECTION_PUBLIC_KEY_LIVE || "FEarZUmzY6CidJPkufVbiEEvxBFYYY5bfSNpvZ5sp5Zj");

    console.log('[oasis] testMode:', testMode, '| CollectionPublicKey:', payload.CollectionPublicKey);

    // =========================
    // 5. RESOLVE BUYER AVATAR
    // =========================
    const recipientEmail = String(order.email || payload.MetaData?.email || "").trim();
    const avatarProvision = { createdNewAvatar: false, avatarId: null, activationUrl: null, activationKey: null, warning: null, linked: false };

    let buyerAvatarId = null;
    let buyerAvatar   = null;
    let buyerTempPassword      = null;
    let buyerVerificationToken = null;
    let createdNewAvatar       = false;

    console.log('[oasis] step 5: resolving buyer avatar for', recipientEmail || '(no email)');

    if (recipientEmail) {
      try {
        const existing = await lookupAvatarByEmail(oasis, recipientEmail);
        console.log('[oasis] existing avatar:', existing ? (existing.avatarId || existing.id) : 'not found');
        buyerAvatar = existing;

        if (!buyerAvatar) {
          createdNewAvatar = true;
          const baseUsername = usernameFromEmail(recipientEmail);

          for (let attempt = 0; attempt < 3; attempt++) {
            const password = randomPassword(20);
            const username = attempt === 0 ? baseUsername : `${baseUsername}-${attempt + 1}`;
            try {
              const reg = await registerBuyerAvatar(oasis, { email: recipientEmail, username, password });
              buyerAvatar            = reg.avatar;
              buyerTempPassword      = reg.password;
              buyerVerificationToken = reg.verificationToken;

              if (buyerVerificationToken) {
                try {
                  await verifyAvatarEmail(oasis, buyerVerificationToken);
                  console.log('[oasis] new avatar email verified');
                } catch (verifyErr) {
                  console.log('[oasis] email verify failed (non-fatal):', verifyErr.message);
                }
              }
              break;
            } catch (regErr) {
              if (regErr.alreadyExists) {
                console.log('[oasis] email already exists — minting without avatar link');
                break;
              }
              if (!/duplicate|exists|already/i.test(String(regErr?.message || regErr))) throw regErr;
            }
          }
        }

        buyerAvatarId = buyerAvatar?.avatarId || buyerAvatar?.id || null;
        console.log('[oasis] buyerAvatarId:', buyerAvatarId, '| createdNewAvatar:', createdNewAvatar);
      } catch (avatarErr) {
        console.log('[oasis] avatar resolution failed (non-fatal):', avatarErr?.message || avatarErr);
        avatarProvision.warning = `Avatar resolution failed: ${avatarErr?.message || avatarErr}`;
      }
    }

    payload.MintedByAvatarId          = buyerAvatarId || platformAvatarId;
    payload.SendToAvatarAfterMintingId = buyerAvatarId || platformAvatarId;
    payload.Price = order.priceSOL || 0;
    payload.WaitForNFTToMintInSeconds = 300;
    payload.FreezeMetadata = true;

    // =========================
    // 5b. EARLYBIRD CHECK
    // =========================
    const isEarlyBird = recipientEmail
      ? !!(await redis.sIsMember(`${P}waitlist:emails`, recipientEmail.toLowerCase().trim()))
      : false;
    console.log('[oasis] earlyBird:', isEarlyBird, 'for email:', recipientEmail);
    payload.MetaData = { ...(payload.MetaData || {}), earlyBird: String(isEarlyBird) };

    // =========================
    // 6. MARK ORDER MINTING
    // =========================
    console.log('[oasis] step 6: marking order as minting');
    order.status = "minting";
    await redis.set(`${P}order:${order.orderId}`, JSON.stringify(order));

    // =========================
    // 7. MINT NFT VIA WEB4 SDK
    // =========================
    console.log('[oasis] step 7: oasis.nft.mintNftAsync');
    const mintRes = await oasis.nft.mintNftAsync(payload);

    // SDK unwraps double-nested OASIS envelope: mintRes.result is already the inner payload.
    // isError can be true even on success (e.g. Solana send retries) — check mintTransactionHash.
    const mintedNFT    = mintRes.result?.web3NFTs?.[0];
    const mintSucceeded = mintedNFT?.mintTransactionHash && !mintedNFT.mintTransactionHash.toLowerCase().includes('error');

    console.log('[oasis] step 7: isError:', mintRes.isError, '| mintTransactionHash:', mintedNFT?.mintTransactionHash);

    if (mintRes.isError && !mintSucceeded) {
      throw new Error(mintRes.message || 'OASIS returned an error');
    }

    // =========================
    // 8. RECORD AVATAR PROVISION
    // =========================
    if (buyerAvatarId) {
      avatarProvision.createdNewAvatar = createdNewAvatar;
      avatarProvision.avatarId         = buyerAvatarId;
      avatarProvision.linked           = true;
      console.log('[oasis] step 8: NFT minted to avatar', buyerAvatarId, '| createdNewAvatar:', createdNewAvatar);

      if (createdNewAvatar && buyerAvatar) {
        const activationKey = crypto.randomUUID();
        const activationUrl = buildActivationUrl({ email: recipientEmail, activationKey });

        await storeActivationRecord({
          email: recipientEmail,
          username: buyerAvatar.username || null,
          activationKey,
          avatarId: buyerAvatarId,
          verificationToken: buyerVerificationToken,
          tempPassword: buyerTempPassword,
          testMode,
        });

        avatarProvision.activationKey = activationKey;
        avatarProvision.activationUrl = activationUrl;
        console.log('[oasis] step 8: activation record stored, url:', activationUrl);
      }
    } else {
      avatarProvision.warning = avatarProvision.warning || 'No buyer avatar resolved — NFT minted under platform account';
      console.log('[oasis] step 8: no buyer avatar, NFT under platform account');
    }

    // =========================
    // 9. SAVE SUCCESS
    // =========================
    order.used      = true;
    order.status    = "minted";
    order.mintedAt  = Date.now();
    order.mintTx    = mintedNFT?.mintTransactionHash     || null;
    order.sendTx    = mintedNFT?.sendNFTTransactionHash  || null;
    order.paymentSignature       = payload.MetaData.paymentSignature || null;
    order.email                  = payload.MetaData.email || null;
    order.avatarId               = avatarProvision.avatarId || null;
    order.avatarCreated          = avatarProvision.createdNewAvatar;
    order.avatarActivationKey    = avatarProvision.activationKey || null;
    order.avatarActivationUrl    = avatarProvision.activationUrl || null;
    order.avatarProvisionWarning = avatarProvision.warning || null;
    console.log('[oasis] raw mint response (truncated):', JSON.stringify(mintRes.raw)?.slice(0, 500));

    console.log('[oasis] step 9a: saving order to redis');
    await redis.set(`${P}order:${order.orderId}`, JSON.stringify(order));
    console.log('[oasis] step 9b: order saved');

    const tier = payload.MetaData?.tier;
    if (tier) {
      console.log('[oasis] step 9c: incrementing mint count for tier:', tier);
      await redis.incr(`${P}mint_count:${tier}`);
      console.log('[oasis] step 9d: mint count incremented');
    }

    // =========================
    // 10. NOTIFY OWNER
    // =========================
    try {
      const tierLabels = { genesis: '⚡ Genesis', core: '🔵 Core', supporter: '🟢 Supporter' };
      const tierLabel = tierLabels[tier] || tier || 'Unknown';
      const notifyTo = (process.env.OWNER_NOTIFICATION_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean);
      console.log('[oasis] sending owner notification to:', notifyTo, '| from:', process.env.EMAIL_FROM);
      if (!notifyTo.length) {
        console.warn('[oasis] OWNER_NOTIFICATION_EMAIL not set — skipping owner notification');
      } else {
        await resendWithRetry({
          from: process.env.EMAIL_FROM,
          to: notifyTo,
          subject: `🌌 New Founder Mint — ${tierLabel} (${recipientEmail || 'no email'})`,
          html: `
            <div style="background:#01040f;color:#e0e0e0;font-family:sans-serif;padding:32px;max-width:520px;margin:0 auto;border-radius:16px;border:1px solid #00e5ff22">
              <h2 style="color:#00e5ff;margin:0 0 16px">New Founder Minted!</h2>
              <p style="margin:0 0 8px">Tier: <strong style="color:#00e5ff">${tierLabel}</strong></p>
              <p style="margin:0 0 8px">Email: <strong>${recipientEmail || 'not provided'}</strong></p>
              <p style="margin:0 0 8px">Early Bird: <strong>${isEarlyBird ? 'Yes ✅' : 'No'}</strong></p>
              <p style="margin:0 0 8px">Wallet: <code style="color:#f0a500">${payload.SendToAddressAfterMinting || 'unknown'}</code></p>
              <p style="margin:0 0 8px">Mint Tx: <code style="color:#888;font-size:12px">${order.mintTx || 'pending'}</code></p>
              <p style="margin:0 0 8px">Test Mode: ${testMode ? 'YES' : 'no'}</p>
            </div>
          `
        });
        console.log('[oasis] owner notification sent ok');
      }
    } catch (notifyErr) {
      console.warn('[oasis] owner notification error (non-fatal):', notifyErr.message);
    }

    return res.status(200).json({
      success: true,
      result: mintRes.raw,
      earlyBird:              isEarlyBird,
      avatarCreated:          avatarProvision.createdNewAvatar,
      avatarId:               avatarProvision.avatarId,
      activationUrl:          avatarProvision.activationUrl,
      activationKey:          avatarProvision.activationKey,
      avatarProvisionWarning: avatarProvision.warning,
      //_debug: { testMode, collectionPublicKey: payload.CollectionPublicKey } // DO NOT expose to client
    });

  } catch (e) {
    console.error('OASIS handler error:', e);

    if (order && order.status === "minting" && !order.used) {
      order.status = "paid";
      try { await redis.set(`${P}order:${order.orderId}`, JSON.stringify(order)); } catch {}
    }

    return res.status(500).json({
      error: e.message || 'Unknown error',
      //_debug: { // DO NOT expose to client
      //  testMode:          process.env.TEST_MODE,
      //  collectionPublicKey: TEST_MODE ? process.env.COLLECTION_PUBLIC_KEY_TEST : process.env.COLLECTION_PUBLIC_KEY_LIVE,
      //  username:          TEST_MODE ? process.env.OASIS_AVATAR_USERNAME_TEST : process.env.OASIS_AVATAR_USERNAME_LIVE,
      //  avatarId:          TEST_MODE ? process.env.OASIS_AVATAR_ID_TEST       : process.env.OASIS_AVATAR_ID_LIVE,
      //}
    });
  }
}
