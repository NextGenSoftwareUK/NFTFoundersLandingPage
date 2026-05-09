// import { kv } from "@vercel/kv";

// const CACHE_KEY = "sol:price:usd";
// const CACHE_TTL = 60 * 30; // 30 minutes

// export async function getSolPriceUSD() {
//   // 1. check cache
//   const cached = await kv.get(CACHE_KEY);
//   if (cached) return cached;

//   // 2. fetch fresh
//   const res = await fetch(
//     "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
//   );

//   if (!res.ok) throw new Error("Failed to fetch SOL price");

//   const data = await res.json();
//   const price = data?.solana?.usd;

//   if (!price) throw new Error("Invalid SOL price response");

//   // 3. cache it
//   await kv.set(CACHE_KEY, price, { ex: CACHE_TTL });

//   return price;
// }

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_URL.split(":")[2]?.split("@")[0]
});

const CACHE_KEY = "sol:price:usd";
const CACHE_TTL = 60 * 30;

export async function getSolPriceUSD() {
  // cache lookup
  const cached = await redis.get(CACHE_KEY);

  if (cached) return Number(cached);

  // fetch live
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
  );

  if (!res.ok) {
    throw new Error("Failed to fetch SOL price");
  }

  const data = await res.json();

  const price = data?.solana?.usd;

  if (!price) {
    throw new Error("Invalid SOL price");
  }

  // cache
  await redis.set(CACHE_KEY, price, {
    ex: CACHE_TTL
  });

  return Number(price);
}

// let cache = {
//   price: null,
//   time: 0
// };

// export async function getSolPriceUSD() {
//   const now = Date.now();

//   // 60 second cache
//   if (cache.price && now - cache.time < 60000) {
//     return cache.price;
//   }

//   const res = await fetch(
//     "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
//   );

//   if (!res.ok) {
//     throw new Error("Failed to fetch SOL price");
//   }

//   const data = await res.json();

//   const price = data?.solana?.usd;

//   if (!price) {
//     throw new Error("Invalid SOL price");
//   }

//   cache = {
//     price,
//     time: now
//   };

//   return price;
// }