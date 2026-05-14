
const { createClient } = require("redis");
const Stripe = require("stripe");

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
    const { paymentIntentId, orderId, testMode } = req.body;
    console.log("VERIFY BODY:", req.body);

    //const stripe = testMode ? new Stripe(process.env.STRIPE_SECRET_KEY_TEST) : new Stripe(process.env.STRIPE_SECRET_KEY_LIVE);
    const stripe = testMode ? new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
    await ensureRedis();

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return res.status(403).json({ error: "Not paid" });
    }

    const orderRaw = await redis.get(`order:${orderId}`);

    if (!orderRaw) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = JSON.parse(orderRaw);

    // prevent double-processing
    if (order.status === "paid" || order.used) {
      return res.json({ success: true, alreadyPaid: true });
    }

    order.status = "paid";
    order.paidAt = Date.now();
    order.paymentIntentId = paymentIntentId;

    await redis.set(`order:${orderId}`, JSON.stringify(order));

    return res.json({ success: true });
  }

  catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}