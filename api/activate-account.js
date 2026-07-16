const { createClient } = require("redis");
const redis = createClient({ url: process.env.REDIS_URL });

redis.on("error", (err) => console.error("Redis error:", err));

let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

const OASIS_API_URL = "https://api.web4.oasisomniverse.one";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://oportal.oasisomniverse.one",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default async function handler(req, res) {
  // CORS preflight
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, key, newPassword } = req.body || {};

  if (!email || !key || !newPassword) {
    return res.status(400).json({ error: "Missing email, key, or newPassword" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    await ensureRedis();

    // 1. Look up activation record
    const raw = await redis.get(`avatar-activation:${key}`);
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

    // 2. Reset password using the verification token + old temp password
    const resetRes = await fetch(`${OASIS_API_URL}/api/avatar/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: verificationToken,
        oldPassword: tempPassword,
        newPassword
      })
    });

    const resetText = await resetRes.text();
    let resetData;
    try { resetData = JSON.parse(resetText); } catch {
      throw new Error(`Unexpected response from OASIS: ${resetText.slice(0, 200)}`);
    }

    if (!resetRes.ok || resetData?.result?.isError || resetData?.isError) {
      const msg = resetData?.result?.message || resetData?.message || `HTTP ${resetRes.status}`;
      throw new Error(`Password reset failed: ${msg}`);
    }

    // 3. Authenticate with the new password to get a JWT for the portal
    const authRes = await fetch(`${OASIS_API_URL}/api/avatar/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: newPassword })
    });

    const authData = await authRes.json();
    const jwt = authData?.result?.result?.jwtToken ?? authData?.result?.jwtToken;
    const avatarObj = authData?.result?.result ?? authData?.result ?? null;
    const portalAvatar = avatarObj ? { ...avatarObj, jwtToken: jwt } : null;

    // 5. Consume activation key so it can't be replayed
    await redis.del(`avatar-activation:${key}`);

    return res.status(200).json({
      success: true,
      avatar: portalAvatar
    });

  } catch (e) {
    console.error("[activate-account] error:", e.message);
    return res.status(500).json({ error: e.message || "Activation failed" });
  }
}
