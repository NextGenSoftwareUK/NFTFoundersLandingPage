import { kv } from "@vercel/kv";

export async function rateLimit(wallet) {
  const key = `rl:${wallet}`;

  const hits = (await kv.get(key)) || 0;

  if (hits > 5) {
    return false;
  }

  await kv.set(key, hits + 1, { ex: 60 }); // 1 min window

  return true;
}