import { getSolPriceUSD } from "./lib/solPrice";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = async () => {
    try {
      const price = await getSolPriceUSD();
      res.write(`data: ${JSON.stringify({ price })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    }
  };

  await send();

  const interval = setInterval(send, 15000); // every 15s

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
}