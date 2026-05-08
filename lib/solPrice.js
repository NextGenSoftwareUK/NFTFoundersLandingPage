import { kv } from "@vercel/kv";

const CACHE_KEY = "sol:price:usd";
const CACHE_TTL = 60 * 30; // 30 minutes

export async function getSolPriceUSD() {
  // 1. check cache
  const cached = await kv.get(CACHE_KEY);
  if (cached) return cached;

  // 2. fetch fresh
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
  );

  if (!res.ok) throw new Error("Failed to fetch SOL price");

  const data = await res.json();
  const price = data?.solana?.usd;

  if (!price) throw new Error("Invalid SOL price response");

  // 3. cache it
  await kv.set(CACHE_KEY, price, { ex: CACHE_TTL });

  return price;
}