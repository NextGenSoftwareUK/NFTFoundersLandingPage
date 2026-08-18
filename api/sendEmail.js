import { createClient } from "redis";

const TEST_MODE = process.env.TEST_MODE === 'true';
const P = TEST_MODE ? 'test:' : '';

let redisClient = null;
let redisReady = null;
async function ensureRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false } });
    redisClient.on("error", (err) => console.error("Redis error:", err));
  }
  if (!redisReady) redisReady = redisClient.connect();
  return redisReady;
}

const OASIS_API_URL = TEST_MODE
  ? process.env.OASIS_API_URL_TEST
  : process.env.OASIS_API_URL_LIVE;
console.log('[sendEmail] OASIS_API_URL:', OASIS_API_URL, '| TEST_MODE:', TEST_MODE);
const ACTIVATION_PORTAL_URL = TEST_MODE
  ? "https://dev.oportal.oasisomniverse.one/activate.html"
  : "https://oportal.oasisomniverse.one/activate.html";
const ACTIVATION_TTL_SECONDS = 60 * 60 * 24 * 30;

function randomPassword(length = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function randomUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

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
    lastErr = `Resend error: ${body}`;
    console.warn(`[sendEmail] Resend attempt ${attempt} failed (${res.status}): ${body}`);
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 2000 * attempt));
  }
  // All retries exhausted — push to queue for later retry
  await queueFailedEmail(payload).catch(e => console.error('[sendEmail] failed to queue email:', e.message));
  throw new Error(lastErr);
}

async function queueFailedEmail(payload) {
  await ensureRedis();
  const entry = { payload, queuedAt: Date.now(), attempts: 0 };
  await redisClient.lPush(`${P}email-queue`, JSON.stringify(entry));
  console.warn('[sendEmail] email queued for later retry:', payload.to, payload.subject);
}

async function handleProcessEmailQueue(req, res) {
  const secret = process.env.EMAIL_QUEUE_SECRET;
  if (secret && req.body?.secret !== secret)
    return res.status(401).json({ error: 'Unauthorized' });

  await ensureRedis();
  const results = { sent: 0, failed: 0, remaining: 0 };

  // Process up to 20 queued emails per call
  for (let i = 0; i < 20; i++) {
    const raw = await redisClient.rPop(`${P}email-queue`);
    if (!raw) break;

    let entry;
    try { entry = JSON.parse(raw); } catch { results.failed++; continue; }

    try {
      const res2 = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify(entry.payload)
      });
      if (res2.ok) {
        results.sent++;
        console.log('[sendEmail] queued email sent ok:', entry.payload.to, entry.payload.subject);
      } else {
        const body = await res2.text();
        entry.attempts = (entry.attempts || 0) + 1;
        if (entry.attempts < 10) {
          await redisClient.lPush(`${P}email-queue`, JSON.stringify(entry));
          console.warn(`[sendEmail] queued email still failing (attempt ${entry.attempts}), re-queued:`, body);
        } else {
          console.error('[sendEmail] queued email exceeded max attempts, dropping:', entry.payload.to, body);
        }
        results.failed++;
      }
    } catch (e) {
      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts < 10) await redisClient.lPush(`${P}email-queue`, JSON.stringify(entry));
      results.failed++;
    }
  }

  results.remaining = await redisClient.lLen(`${P}email-queue`);
  return res.status(200).json({ success: true, ...results });
}

const TIER_LABELS = { genesis: '⚡ Genesis', core: '🔵 Core', supporter: '🟢 Supporter' };
// const NFT_IMAGES  = { genesis: 'https://founders.oasisomniverse.one/img/nft-genesis-wallet.png', core: 'https://founders.oasisomniverse.one/img/nft-core-wallet.png', supporter: 'https://founders.oasisomniverse.one/img/nft-supporter-wallet.png' };
const NFT_IMAGES  = { genesis: 'https://arweave.net/HzQmmCiM2iWsS94BuZhTuGwBMTzpaEaVnYC7rXe2fTod', core: 'https://arweave.net/CydoH7RJLY6WoezqDQhQJ9Sq6h2Rs5Dibmz21sNHicn7', supporter: 'https://arweave.net/HoYjMGJJNMp2rSu8Nvk54W8khzfa85ztWGyzDgH6t87M' };

async function handleResendConfirmation(req, res) {
  const { orderId, secret } = req.body || {};
  const envSecret = process.env.EMAIL_QUEUE_SECRET;
  if (envSecret && secret !== envSecret) return res.status(401).json({ error: 'Unauthorized' });
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  await ensureRedis();
  const raw = await redisClient.get(`${P}order:${orderId}`);
  if (!raw) return res.status(404).json({ error: 'Order not found' });

  const order = JSON.parse(raw);
  if (order.status !== 'minted') return res.status(400).json({ error: `Order status is '${order.status}', not minted` });

  const email     = order.email;
  const tier      = order.tier || 'supporter';
  const tierTitle = TIER_LABELS[tier] || tier;
  const txHash    = order.mintTx || null;
  const activationUrl  = order.avatarActivationUrl || null;
  const activationLabel = order.avatarCreated ? 'Activate Your Avatar' : null;
  const earlyBird = !!(await redisClient.sIsMember(`${P}waitlist:emails`, (email || '').toLowerCase().trim()));
  const nftImage  = NFT_IMAGES[tier] || NFT_IMAGES.supporter;
  const chain     = 'Solana SPL';
  const testMode  = false;

  if (!email) return res.status(400).json({ error: 'Order has no email address' });

  // Reuse handleSendEmail by injecting into req.body
  req.body = { email, tierTitle, tierBadge: tier, chain, txHash, nftImage, testMode, activationUrl, activationLabel, earlyBird };
  return await handleSendEmail(req, res);
}

const ALLOWED_ORIGINS = new Set([
  "https://oportal.oasisomniverse.one",
  "https://dev.oportal.oasisomniverse.one"
]);

function getCorsHeaders(req) {
  const origin = req.headers.origin || '';
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://oportal.oasisomniverse.one",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

async function handleActivate(req, res) {
  const { email, key, newPassword } = req.body || {};
  console.log('[activate] start — email:', email, 'key:', key, 'passwordLen:', newPassword?.length);

  if (!email || !key || !newPassword) {
    return res.status(400).json({ error: "Missing email, key, or newPassword" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  await ensureRedis();

  const raw = await redisClient.get(`${P}avatar-activation:${key}`);
  console.log('[activate] redis record found:', !!raw);
  if (!raw) {
    return res.status(404).json({ error: "Activation link has expired or already been used. Please contact support." });
  }

  let record;
  try { record = JSON.parse(raw); } catch {
    return res.status(500).json({ error: "Corrupt activation record" });
  }

  console.log('[activate] record email:', record.email, 'avatarId:', record.avatarId, 'username:', record.username, 'hasTempPassword:', !!record.tempPassword, 'hasVerificationToken:', !!record.verificationToken);

  if (record.email?.toLowerCase() !== email.toLowerCase()) {
    return res.status(403).json({ error: "Email does not match activation record" });
  }

  const { username, tempPassword, verificationToken, avatarId } = record;
  if (!username || !tempPassword || !verificationToken || !avatarId) {
    console.log('[activate] incomplete record — username:', !!username, 'tempPassword:', !!tempPassword, 'verificationToken:', !!verificationToken, 'avatarId:', !!avatarId);
    return res.status(500).json({ error: "Incomplete activation record — please contact support" });
  }

  const testMode = process.env.TEST_MODE === 'true';
  const wizardUsername = testMode ? process.env.OASIS_AVATAR_USERNAME_TEST : process.env.OASIS_AVATAR_USERNAME_LIVE;
  const wizardPassword = testMode ? process.env.OASIS_AVATAR_PASSWORD_TEST : process.env.OASIS_AVATAR_PASSWORD_LIVE;
  console.log('[activate] testMode:', testMode, 'wizardUsername:', wizardUsername, 'wizardPassword set:', !!wizardPassword);

  // Authenticate as Wizard — can update any avatar regardless of verification status
  const wizardAuthRes = await fetch(`${OASIS_API_URL}/api/avatar/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: wizardUsername, password: wizardPassword })
  });

  console.log('[activate] wizard auth status:', wizardAuthRes.status);
  if (!wizardAuthRes.ok) throw new Error(`Wizard auth failed (${wizardAuthRes.status})`);
  const wizardData = await wizardAuthRes.json();
  console.log('[activate] wizard auth isError:', wizardData?.result?.isError, 'msg:', wizardData?.result?.message);
  if (wizardData?.result?.isError) throw new Error(wizardData?.result?.message || "Wizard authentication failed");
  const wizardJwt = wizardData?.result?.result?.jwtToken ?? wizardData?.result?.jwtToken;
  console.log('[activate] wizard JWT obtained:', !!wizardJwt);
  if (!wizardJwt) throw new Error("No JWT returned from Wizard auth");

  // Update the avatar's password using the Wizard JWT (backend now hashes via BCrypt)
  console.log('[activate] calling update-by-id for avatarId:', avatarId);
  const updateRes = await fetch(`${OASIS_API_URL}/api/Avatar/update-by-id/${avatarId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${wizardJwt}` },
    body: JSON.stringify({ password: newPassword, confirmPassword: newPassword })
  });

  const updateText = await updateRes.text();
  console.log('[activate] update-by-id status:', updateRes.status, 'body:', updateText.slice(0, 300));
  let updateData;
  try { updateData = JSON.parse(updateText); } catch {
    throw new Error(`Unexpected response from OASIS: ${updateText.slice(0, 200)}`);
  }

  if (!updateRes.ok || updateData?.result?.isError || updateData?.isError) {
    const msg = updateData?.result?.message || updateData?.message || `HTTP ${updateRes.status}`;
    throw new Error(`Password update failed: ${msg}`);
  }

  // Now authenticate as the user with their new password to get their own JWT for the portal
  console.log('[activate] re-authenticating as user:', username);
  const authRes = await fetch(`${OASIS_API_URL}/api/avatar/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: newPassword })
  });

  const authText = await authRes.text();
  let authData;
  try { authData = JSON.parse(authText); } catch { authData = null; }
  console.log('[activate] user auth status:', authRes.status, 'isError:', authData?.result?.isError, 'body:', authText.slice(0, 400));

  let freshJwt = authData?.result?.result?.jwtToken ?? authData?.result?.jwtToken;
  let avatarObj = authData?.result?.result ?? authData?.result ?? null;

  // If username auth failed, retry with email (some OASIS builds accept email as username)
  if (!freshJwt || authData?.result?.isError) {
    console.log('[activate] username auth failed, retrying with email:', email);
    const authRes2 = await fetch(`${OASIS_API_URL}/api/avatar/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password: newPassword })
    });
    const authText2 = await authRes2.text();
    let authData2;
    try { authData2 = JSON.parse(authText2); } catch { authData2 = null; }
    console.log('[activate] email auth status:', authRes2.status, 'isError:', authData2?.result?.isError, 'body:', authText2.slice(0, 400));
    if (!authData2?.result?.isError) {
      freshJwt = authData2?.result?.result?.jwtToken ?? authData2?.result?.jwtToken;
      avatarObj = authData2?.result?.result ?? authData2?.result ?? null;
    }
  }

  // Preserve the stored username so the portal shows the correct identity
  const portalAvatar = (avatarObj && freshJwt)
    ? { ...avatarObj, jwtToken: freshJwt, username: username || avatarObj.username || avatarObj.UserName }
    : null;
  console.log('[activate] portalAvatar username:', portalAvatar?.username, 'jwtToken set:', !!portalAvatar?.jwtToken);

  await redisClient.del(`${P}avatar-activation:${key}`);
  console.log('[activate] success — redis key deleted');

  return res.status(200).json({ success: true, avatar: portalAvatar });
}

async function handleResendActivation(req, res) {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Missing email" });

  await ensureRedis();

  // Look up the avatar by email using Wizard JWT
  const wizardAuthRes = await fetch(`${OASIS_API_URL}/api/avatar/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.TEST_MODE === 'true' ? process.env.OASIS_AVATAR_USERNAME_TEST : process.env.OASIS_AVATAR_USERNAME_LIVE, password: process.env.TEST_MODE === 'true' ? process.env.OASIS_AVATAR_PASSWORD_TEST : process.env.OASIS_AVATAR_PASSWORD_LIVE })
  });
  if (!wizardAuthRes.ok) throw new Error("Wizard auth failed");
  const wizardData = await wizardAuthRes.json();
  const wizardJwt = wizardData?.result?.result?.jwtToken ?? wizardData?.result?.jwtToken;
  if (!wizardJwt) throw new Error("No wizard JWT");

  const avatarRes = await fetch(`${OASIS_API_URL}/api/Avatar/GetAvatarByEmail/${encodeURIComponent(email)}`, {
    headers: { "Authorization": `Bearer ${wizardJwt}` }
  });
  if (!avatarRes.ok) return res.status(404).json({ error: "No avatar found for this email. Please contact support." });
  const avatarData = await avatarRes.json();
  const avatar = avatarData?.result?.result ?? avatarData?.result ?? null;
  if (!avatar) return res.status(404).json({ error: "No avatar found for this email." });

  const avatarId = avatar.id || avatar.avatarId;
  const username = avatar.username;
  if (!avatarId || !username) return res.status(500).json({ error: "Incomplete avatar record — please contact support." });

  // Generate a new temp password and update the avatar
  const tempPassword = randomPassword(20);
  const updateRes = await fetch(`${OASIS_API_URL}/api/Avatar/update-by-id/${avatarId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${wizardJwt}` },
    body: JSON.stringify({ password: tempPassword, confirmPassword: tempPassword })
  });
  if (!updateRes.ok) throw new Error(`Failed to reset temp password: HTTP ${updateRes.status}`);

  // Store fresh activation record
  const activationKey = randomUUID();
  const record = { email, username, avatarId, tempPassword, verificationToken: avatar.verificationToken || "", testMode: false, createdAt: Date.now() };
  await redisClient.set(`${P}avatar-activation:${activationKey}`, JSON.stringify(record), { EX: ACTIVATION_TTL_SECONDS });

  // Build activation URL and resend email
  const activationUrl = `${ACTIVATION_PORTAL_URL}?email=${encodeURIComponent(email)}&key=${activationKey}`;

  await resendWithRetry({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Activate your OASIS Avatar — new link",
    html: `
      <div style="background:#01040f;color:#e0e0e0;font-family:sans-serif;padding:40px;max-width:560px;margin:0 auto;border-radius:16px;border:1px solid #00e5ff22">
        <h1 style="color:#00e5ff;margin:0 0 8px">NEW ACTIVATION LINK</h1>
        <p style="color:#a8bfd8;margin:0 0 24px">Your previous link expired. Here is a fresh one — valid for 30 days.</p>
        <div style="background:#071022;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #00e5ff33">
          <p style="margin:0 0 10px;font-size:16px"><strong>Activate Your OASIS Avatar</strong></p>
          <p style="margin:0 0 14px;color:#888;font-size:13px">Click below to set your password and access the portal.</p>
          <p style="margin:0 0 14px;color:#f0a500;font-size:12px">⚠️ This link expires in 30 days.</p>
          <a href="${activationUrl}" style="display:inline-block;padding:10px 18px;background:#00e5ff11;border:1px solid #00e5ff44;border-radius:8px;color:#00e5ff;text-decoration:none;font-size:13px;font-weight:600" target="_blank" rel="noopener">Activate Your Avatar</a>
        </div>
        <p style="color:#a8bfd8;font-size:13px">Questions? Contact us on Telegram: <a href="https://t.me/oasisweb4chat" style="color:#00e5ff;text-decoration:none">https://t.me/oasisweb4chat</a></p>
        <hr style="border:none;border-top:1px solid #ffffff11;margin:24px 0">
        <p style="color:#6a80a8;font-size:11px;margin:0">OASIS · Founder Access Program</p>
      </div>
    `
  });

  return res.status(200).json({ success: true });
}

async function handleSendEmail(req, res) {
  const {
    email, tierTitle, tierBadge, chain, txHash,
    nftImage, testMode, activationUrl, activationLabel, earlyBird
  } = req.body;

  if (!email || !tierTitle) return res.status(400).json({ error: 'Missing fields' });

  const getExplorerUrl = (chainName, hash, isTestMode) => {
    if (!hash) return null;
    const c = chainName?.toLowerCase();
    if (c?.includes('solana')) return isTestMode ? `https://explorer.solana.com/tx/${hash}?cluster=devnet` : `https://explorer.solana.com/tx/${hash}`;
    if (c?.includes('ethereum')) return isTestMode ? `https://etherscan.io/tx/${hash}?testnet=true` : `https://etherscan.io/tx/${hash}`;
    if (c?.includes('polygon')) return isTestMode ? `https://polygonscan.com/tx/${hash}?testnet=true` : `https://polygonscan.com/tx/${hash}`;
    return null;
  };

  const explorerUrl = getExplorerUrl(chain, txHash, testMode);
  const txLine = txHash ? `
    <p style="margin:8px 0;color:#888">Transaction:
      ${explorerUrl
        ? `<a href="${explorerUrl}" style="color:#00e5ff;text-decoration:none" target="_blank">${txHash.slice(0,24)}...${txHash.slice(-8)} 🔗</a>`
        : `<span style="color:#00e5ff">${txHash.slice(0,24)}...${txHash.slice(-8)}</span>`
      }
    </p>`
  : '';

  const imageLine = nftImage ? `
    <div style="text-align:center;margin-bottom:24px">
      <img src="${nftImage}" alt="Your OASIS Founder NFT"
        style="max-width:280px;width:100%;border-radius:12px;border:1px solid #00e5ff44" />
    </div>`
  : '';

  const activationSection = activationUrl ? `
    <div style="background:#071022;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #00e5ff33">
      <p style="margin:0 0 10px;font-size:16px"><strong>Your OASIS Avatar Needs Activation</strong></p>
      <p style="margin:0 0 14px;color:#888;font-size:13px">We found no existing avatar for this email, so one has been created for you. Activate it to verify your identity and choose a new password.</p>
      <p style="margin:0 0 14px;color:#f0a500;font-size:12px">⚠️ This link expires in 30 days. If it expires, visit the portal and use the "Resend activation email" option.</p>
      <a href="${activationUrl}" style="display:inline-block;padding:10px 18px;background:#00e5ff11;border:1px solid #00e5ff44;border-radius:8px;color:#00e5ff;text-decoration:none;font-size:13px;font-weight:600" target="_blank" rel="noopener">${activationLabel || 'Activate Your Avatar'}</a>
    </div>
  ` : '';

  const subject = activationUrl
    ? `Activate your OASIS Avatar — ${tierTitle}`
    : `🌌 Your OASIS Founder NFT is confirmed — ${tierTitle}`;

  await resendWithRetry({
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    html: `
      <div style="background:#01040f;color:#e0e0e0;font-family:sans-serif;padding:40px;max-width:560px;margin:0 auto;border-radius:16px;border:1px solid #00e5ff22">
        <h1 style="color:#00e5ff;margin:0 0 8px">${activationUrl ? 'MINT SUCCESSFUL + ACTIVATION REQUIRED' : 'MINT SUCCESSFUL'}</h1>
        <p style="color:#888;margin:0 0 24px">${activationUrl ? 'Your NFT is confirmed and your avatar is ready for activation.' : 'Welcome to the OASIS, Founder.'}</p>
        ${imageLine}
        <div style="background:#0a0f2a;border-radius:12px;padding:24px;margin-bottom:24px">
          <p style="margin:0 0 8px;font-size:18px"><strong>${tierTitle}</strong></p>
          <p style="margin:8px 0;color:#888">Chain: ${chain}</p>
          ${earlyBird ? `<p style="margin:8px 0;color:#00cc44;font-weight:700">🐦 Early Bird Supporter — you're one of the first to join the OASIS Founders program!</p>` : ''}
          ${txLine}
          ${explorerUrl ? `<a href="${explorerUrl}" style="display:inline-block;margin-top:12px;padding:8px 16px;background:#00e5ff11;border:1px solid #00e5ff44;border-radius:8px;color:#00e5ff;text-decoration:none;font-size:13px">View on Explorer →</a>` : ''}
        </div>
        ${activationSection}
        <p style="color:#a8bfd8;font-size:13px">${activationUrl ? 'Your NFT has been linked to your OASIS avatar. Complete activation to choose your new password and finish setup.' : 'Your NFT grants you Founder access to the OASIS. It should appear in your wallet shortly.'}</p>
        <p style="color:#a8bfd8;font-size:13px">Questions? Contact us on our telegram group: <a href="https://t.me/oasisweb4chat" style="color:#00e5ff;text-decoration:none">https://t.me/oasisweb4chat</a></p>
        <hr style="border:none;border-top:1px solid #ffffff11;margin:24px 0">
        <p style="color:#6a80a8;font-size:11px;margin:0">OASIS · Founder Access Program</p>
      </div>
    `
  });

  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  Object.entries(getCorsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();

  // Vercel cron fires GET — use it to drain the email queue
  if (req.method === "GET") {
    const secret = process.env.EMAIL_QUEUE_SECRET;
    if (secret && req.query?.secret !== secret) return res.status(401).json({ error: 'Unauthorized' });
    return await handleProcessEmailQueue(req, res);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (req.body?.action === 'activate') return await handleActivate(req, res);
    if (req.body?.action === 'resend-activation') return await handleResendActivation(req, res);
    if (req.body?.action === 'resend-confirmation') return await handleResendConfirmation(req, res);
    if (req.body?.action === 'process-email-queue') return await handleProcessEmailQueue(req, res);
    return await handleSendEmail(req, res);
  } catch (e) {
    console.error('[sendEmail] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
