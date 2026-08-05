const { getSolPriceUSD } = require("../lib/solPrice");

export default async function handler(req, res) {
  try {
    const price = await getSolPriceUSD();
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    res.status(200).json({ price });
  } catch (err) {
    console.error("sol-price error:", err);
    res.status(500).json({ error: err.message });
  }
}
