export default async function handler(req, res) {
  try {
    console.log("STREAM START");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = async () => {
      try {
        const price = await getSolPriceUSD();
        //const price = 100;

        res.write(`data: ${JSON.stringify({ price })}\n\n`);
      } catch (e) {
        console.error("SEND ERROR:", e);
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      }
    };

    await send();

    const interval = setInterval(send, 15000);

    req.on("close", () => {
      clearInterval(interval);
      res.end();
    });

  } catch (err) {
    console.error("FATAL STREAM ERROR:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}