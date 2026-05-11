const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

if (paymentIntent.status !== "succeeded") {
  return res.status(403).json({ error: "Not paid" });
}

const orderRaw = await redis.get(`order:${orderId}`);
const order = JSON.parse(orderRaw);

order.status = "paid";

await redis.set(`order:${orderId}`, JSON.stringify(order));

return res.json({ success: true });