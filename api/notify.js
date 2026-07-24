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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, tier } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });

  const tierLabels = { genesis: '⚡ Genesis NFT', core: '🔵 Core NFT', supporter: '🟢 Supporter NFT' };
  const tierLabel = tierLabels[tier] || tier || 'Unknown';

  try {
    // Store email in Redis waitlist set so mint flow can check it
    await ensureRedis();
    await redisClient.sAdd(`${P}waitlist:emails`, email.toLowerCase().trim());
    console.log('[notify] added to waitlist:', email);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: 'davidellams@hotmail.com',
        subject: `🌌 NFT Waitlist Sign-up (${tierLabel}): ${email}`,
        html: `
          <div style="background:#01040f;color:#e0e0e0;font-family:sans-serif;padding:40px;max-width:520px;margin:0 auto;border-radius:16px;border:1px solid #00e5ff22">
            <h2 style="color:#00e5ff;margin:0 0 16px">New NFT Waitlist Registration</h2>
            <p style="margin:0 0 8px;font-size:16px">Someone signed up to be notified when OASIS Founder NFT minting opens:</p>
            <p style="background:#0a0f2a;border-radius:8px;padding:14px 18px;font-size:18px;color:#f0a500;margin:16px 0"><strong>${email}</strong></p>
            <p style="margin:0 0 8px;font-size:15px">NFT they tried to mint: <strong style="color:#00e5ff">${tierLabel}</strong></p>
            <hr style="border:none;border-top:1px solid #ffffff11;margin:24px 0">
            <p style="color:#444;font-size:11px;margin:0">OASIS · Founder Access Program · founders.oasisomniverse.one</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Resend error: ${err}`);
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Notify error:', e.message);
    return res.status(500).json({ error: 'Failed to send notification' });
  }
}
