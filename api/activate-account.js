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

    const { username, tempPassword, avatarId } = record;

    if (!username || !tempPassword || !avatarId) {
      return res.status(500).json({ error: "Incomplete activation record — please contact support" });
    }

    // 2. Authenticate with temp credentials to get JWT
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
    if (authData?.result?.isError) {
      throw new Error(authData?.result?.message || "OASIS authentication failed");
    }

    const jwt = authData?.result?.result?.jwtToken ?? authData?.result?.jwtToken;
    if (!jwt) throw new Error("No JWT returned from OASIS auth");

    // 3. Update avatar password via update-by-id (requires JWT auth)
    const updateRes = await fetch(`${OASIS_API_URL}/api/Avatar/update-by-id/${avatarId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`
      },
      body: JSON.stringify({
        password: newPassword,
        confirmPassword: newPassword
      })
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

    // 4. Re-authenticate with the new password to get a fresh JWT for the portal
    const reAuthRes = await fetch(`${OASIS_API_URL}/api/avatar/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: newPassword })
    });

    const reAuthData = await reAuthRes.json();
    const freshJwt = reAuthData?.result?.result?.jwtToken ?? reAuthData?.result?.jwtToken;
    const avatarObj = reAuthData?.result?.result ?? reAuthData?.result ?? null;

    // Ensure the avatar object has the JWT attached (portal reads avatar.jwtToken)
    const portalAvatar = avatarObj ? { ...avatarObj, jwtToken: freshJwt || jwt } : null;

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
