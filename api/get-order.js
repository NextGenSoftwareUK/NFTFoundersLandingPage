import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  const { orderId } = req.query;

  const order = await kv.get(`order:${orderId}`);

  if (!order) return res.status(404).json({ error: "Not found" });

  res.json(order);
}