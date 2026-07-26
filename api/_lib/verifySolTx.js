// ============================================================
// DEAD CODE — OLD STUB, NOT USED
// This was an early attempt at a verifySolTx serverless
// handler placed inside api/lib/ to avoid it being counted
// as a Vercel function. It uses the deprecated @vercel/kv
// approach and does NOT export verifySolPayment().
// The real working implementation is at: lib/verifySolTx.js
// (project root). Do not delete until confirmed safe.
// ============================================================

// import { kv } from '@vercel/kv';
// import { Connection, PublicKey } from '@solana/web3.js';
//
// const connection = new Connection(process.env.SOLANA_RPC_URL);
// const TREASURY = new PublicKey(process.env.TREASURY_WALLET);
//
// export default async function handler(req, res) {
//   if (req.method !== 'POST') return res.status(405).end();
//
//   try {
//     const { signature, orderId } = req.body;
//
//     const order = await kv.get(`order:${orderId}`);
//
//     if (!order || order.used) {
//       return res.status(400).json({ success: false, error: "Invalid order" });
//     }
//
//     const tx = await connection.getTransaction(signature, {
//       maxSupportedTransactionVersion: 0
//     });
//
//     if (!tx) {
//       return res.status(400).json({ success: false, error: "TX not found" });
//     }
//
//     if (tx.meta.err) {
//       return res.status(400).json({ success: false, error: "TX failed" });
//     }
//
//     const pre = tx.transaction.message.getAccountKeys().staticAccountKeys;
//     const recipient = pre[1].toBase58();
//
//     if (recipient !== TREASURY.toBase58()) {
//       return res.status(400).json({ success: false, error: "Wrong recipient" });
//     }
//
//     const lamports = tx.meta.postBalances[1] - tx.meta.preBalances[1];
//     const solAmount = lamports / 1e9;
//
//     if (solAmount < order.price) {
//       return res.status(400).json({ success: false, error: "Insufficient amount" });
//     }
//
//     order.status = "paid";
//     order.signature = signature;
//     await kv.set(`order:${orderId}`, order);
//
//     return res.json({ success: true });
//
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// }
