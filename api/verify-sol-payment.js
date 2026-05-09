//import { kv } from "@vercel/kv";
//import { verifySolPayment } from "../lib/verifySolTx";
const { verifySolPayment } = require("../lib/verifySolTx");
const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

let redisReady = null;

async function ensureRedis() {
  if (!redisReady) {
    redisReady = redis.connect();
  }

  return redisReady;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { signature, orderId } = req.body;

    await ensureRedis();
    const order = await redis.get(`order:${orderId}`);

    if (!order || order.used) {
      return res.json({ success: false, error: "Invalid order" });
    }

    const result = await verifySolPayment({
      signature,
      expectedRecipient: process.env.TREASURY_WALLET,
      expectedAmountSOL: order.price
    });

    if (!result.ok) {
      return res.json({ success: false, error: result.error });
    }

    order.status = "paid";
    order.signature = signature;

    await redis.set(`order:${orderId}`, JSON.stringify(order));

    return res.json({ success: true });

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// import { kv } from '@vercel/kv';
// import { Connection, PublicKey } from '@solana/web3.js';

// const connection = new Connection(process.env.SOLANA_RPC_URL);
// const TREASURY = new PublicKey(process.env.TREASURY_WALLET);

// export default async function handler(req, res) {
//   if (req.method !== 'POST') return res.status(405).end();

//   try {
//     const { signature, orderId } = req.body;

//     const order = await kv.get(`order:${orderId}`);

//     if (!order || order.used) {
//       return res.status(400).json({ success: false, error: "Invalid order" });
//     }

//     // 🔥 FETCH TX FROM CHAIN
//     const tx = await connection.getTransaction(signature, {
//       maxSupportedTransactionVersion: 0
//     });

//     if (!tx) {
//       return res.status(400).json({ success: false, error: "TX not found" });
//     }

//     if (tx.meta.err) {
//       return res.status(400).json({ success: false, error: "TX failed" });
//     }

//     const pre = tx.transaction.message.getAccountKeys().staticAccountKeys;

//     const sender = pre[0].toBase58();
//     const recipient = pre[1].toBase58();

//     // ⚠️ NOTE: in production you should parse system transfer instructions properly
//     if (recipient !== TREASURY.toBase58()) {
//       return res.status(400).json({ success: false, error: "Wrong recipient" });
//     }

//     // 💰 Basic amount check (simplified)
//     const lamports = tx.meta.postBalances[1] - tx.meta.preBalances[1];
//     const solAmount = lamports / 1e9;

//     if (solAmount < order.price) {
//       return res.status(400).json({ success: false, error: "Insufficient amount" });
//     }

//     // ✔ MARK PAID
//     order.status = "paid";
//     order.signature = signature;

//     await kv.set(`order:${orderId}`, order);

//     return res.json({ success: true });

//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// }