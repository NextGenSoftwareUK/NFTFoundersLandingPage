const { createClient } = require("redis");

const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (err) => console.error("Redis error:", err));

let redisReady = null;
async function ensureRedis() {
  if (!redisReady) redisReady = redis.connect();
  return redisReady;
}

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;

function getRpcUrl(chain, testMode) {
  if (testMode) {
    return chain === "ArbitrumOASIS"
      ? `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  }
  return chain === "ArbitrumOASIS"
    ? `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
    : `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
}

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

async function verifyEvmPayment({ txHash, expectedRecipient, expectedAmountETH, chain, testMode }) {
  const rpcUrl = getRpcUrl(chain, testMode);

  const tx = await rpcCall(rpcUrl, "eth_getTransactionByHash", [txHash]);
  if (!tx) return { ok: false, error: "Transaction not found" };

  const receipt = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { ok: false, error: "Transaction receipt not found" };
  if (receipt.status !== "0x1") return { ok: false, error: "Transaction failed on-chain" };

  // Verify recipient (case-insensitive)
  if (tx.to?.toLowerCase() !== expectedRecipient.toLowerCase()) {
    return { ok: false, error: `Wrong recipient: ${tx.to}` };
  }

  // Verify amount (value is in wei hex)
  const valueBigInt = BigInt(tx.value);
  const expectedWei = BigInt(Math.round(expectedAmountETH * 1e18));
  const tolerance = expectedWei / 1000n; // 0.1% tolerance

  if (valueBigInt < expectedWei - tolerance) {
    const received = Number(valueBigInt) / 1e18;
    return { ok: false, error: `Wrong amount: received ${received.toFixed(6)} ETH` };
  }

  return { ok: true, txHash, from: tx.from, value: Number(valueBigInt) / 1e18 };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { txHash, orderId, wallet, email, tier, chain, testMode } = req.body;

    if (!txHash || !orderId) {
      return res.status(400).json({ error: "Missing txHash or orderId" });
    }

    await ensureRedis();

    const orderRaw = await redis.get(`order:${orderId}`);
    if (!orderRaw) return res.status(404).json({ error: "Order not found" });

    const order = JSON.parse(orderRaw);

    if (order.status === "paid" || order.used) {
      return res.json({ success: true, alreadyPaid: true });
    }

    console.log("Verifying EVM tx:", txHash, "chain:", chain, "treasury:", process.env.EVM_RECEIVER);
    console.log("Expected ETH:", order.priceETH);

    const result = await verifyEvmPayment({
      txHash,
      expectedRecipient: process.env.EVM_RECEIVER,
      expectedAmountETH: order.priceETH,
      chain: order.chain || chain,
      testMode: testMode || process.env.TEST_MODE === "true"
    });

    console.log("Verify result:", result);

    if (!result.ok) {
      return res.status(403).json({ success: false, error: result.error });
    }

    order.status = "paid";
    order.paidAt = Date.now();
    order.txHash = txHash;
    order.email = email || null;
    order.wallet = wallet || order.wallet;

    await redis.set(`order:${orderId}`, JSON.stringify(order));

    return res.json({ success: true });

  } catch (err) {
    console.error("verify-evm-payment error:", err);
    return res.status(500).json({ error: err.message });
  }
}
