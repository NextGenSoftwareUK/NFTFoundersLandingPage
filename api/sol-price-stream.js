const { getSolPriceUSD } = require("../lib/solPrice");
const { getEthPriceUSD } = require("../lib/ethPrice");

export default async function handler(req, res) {
  try {
    console.log("PRICE STREAM START");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = async () => {
      try {
        const [solPrice, ethPrice] = await Promise.all([
          getSolPriceUSD(),
          getEthPriceUSD()
        ]);
        res.write(`data: ${JSON.stringify({ solPrice, ethPrice })}\n\n`);
      } catch (e) {
        console.error("PRICE STREAM SEND ERROR:", e);
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      }
    };

    await send();
    const interval = setInterval(send, 30000);
    req.on("close", () => { clearInterval(interval); res.end(); });

  } catch (err) {
    console.error("PRICE STREAM FATAL:", err);
    res.status(500).json({ error: err.message });
  }
}
