import { createClient } from "redis";

let redisClient = null;
let redisReady = null;
async function ensureRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (err) => console.error("Redis error:", err));
  }
  if (!redisReady) redisReady = redisClient.connect();
  return redisReady;
}

const OASIS_API_URL = "https://api.web4.oasisomniverse.one";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://oportal.oasisomniverse.one",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function handleActivate(req, res) {
  const { email, key, newPassword } = req.body || {};

  if (!email || !key || !newPassword) {
    return res.status(400).json({ error: "Missing email, key, or newPassword" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  await ensureRedis();

  const raw = await redisClient.get(`avatar-activation:${key}`);
  if (!raw) {
    return res.status(404).json({ error: "Activation link has expired or already been used. Please contact support." });
  }

  let record;
  try { record = JSON.parse(raw); } catch {
    return res.status(500).json({ error: "Corrupt activation record" });
  }

  if (record.email?.toLowerCase() !== email.toLowerCase()) {
    return res.status(403).json({ error: "Email does not match activation record" });
  }

  const { username, tempPassword, verificationToken, avatarId } = record;
  if (!username || !tempPassword || !verificationToken || !avatarId) {
    return res.status(500).json({ error: "Incomplete activation record — please contact support" });
  }

  // Authenticate with temp credentials to get a JWT
  const authRes = await fetch(`${OASIS_API_URL}/api/avatar/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: tempPassword })
  });

  if (!authRes.ok) {
    const txt = await authRes.text();
    throw new Error(`OASIS auth failed (${authRes.status}): ${txt.slice(0, 200)}`);
  }

  const authData = await authRes.json();
  if (authData?.result?.isError) throw new Error(authData?.result?.message || "OASIS authentication failed");

  const jwt = authData?.result?.result?.jwtToken ?? authData?.result?.jwtToken;
  if (!jwt) throw new Error("No JWT returned from OASIS auth");

  // Update password using the JWT
  const updateRes = await fetch(`${OASIS_API_URL}/api/Avatar/update-by-id/${avatarId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
    body: JSON.stringify({ password: newPassword, confirmPassword: newPassword })
  });

  const updateText = await updateRes.text();
  let updateData;
  try { updateData = JSON.parse(updateText); } catch {
    throw new Error(`Unexpected response from OASIS: ${updateText.slice(0, 200)}`);
  }

  if (!updateRes.ok || updateData?.result?.isError || updateData?.isError) {
    const msg = updateData?.result?.message || updateData?.message || `HTTP ${updateRes.status}`;
    throw new Error(`Password update failed: ${msg}`);
  }

  // Re-authenticate with new password for a fresh JWT
  const reAuthRes = await fetch(`${OASIS_API_URL}/api/avatar/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: newPassword })
  });

  const reAuthData = await reAuthRes.json();
  const freshJwt = reAuthData?.result?.result?.jwtToken ?? reAuthData?.result?.jwtToken;
  const avatarObj = reAuthData?.result?.result ?? reAuthData?.result ?? null;
  const portalAvatar = avatarObj ? { ...avatarObj, jwtToken: freshJwt || jwt } : null;

  await redisClient.del(`avatar-activation:${key}`);

  return res.status(200).json({ success: true, avatar: portalAvatar });
}

async function handleSendEmail(req, res) {
  const {
    email, tierTitle, tierBadge, chain, txHash,
    nftImage, testMode, activationUrl, activationLabel
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
      <a href="${activationUrl}" style="display:inline-block;padding:10px 18px;background:#00e5ff11;border:1px solid #00e5ff44;border-radius:8px;color:#00e5ff;text-decoration:none;font-size:13px;font-weight:600" target="_blank" rel="noopener">${activationLabel || 'Activate Your Avatar'}</a>
    </div>
  ` : '';

  const subject = activationUrl
    ? `Activate your OASIS Avatar — ${tierTitle}`
    : `🌌 Your OASIS Founder NFT is confirmed — ${tierTitle}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
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
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error: ${err}`);
  }

  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (req.body?.action === 'activate') {
      return await handleActivate(req, res);
    }
    return await handleSendEmail(req, res);
  } catch (e) {
    console.error('[sendEmail] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
