const solanaWeb3 = require("@solana/web3.js");

async function verifySolPayment({
  signature,
  expectedRecipient,
  expectedAmountSOL,
  testMode
}) {

  const connection = testMode
        ? new solanaWeb3.Connection('https://solana-devnet.g.alchemy.com/v2/2gYC0H1CyjRsQnrlyNERe', 'confirmed')
        : new solanaWeb3.Connection('https://solana-mainnet.g.alchemy.com/v2/2gYC0H1CyjRsQnrlyNERe', 'confirmed');

  console.log("Connection:", connection);

  const tx = await connection.getParsedTransaction(
    signature,
    {
      maxSupportedTransactionVersion: 0
    }
  );

  console.log("TX:", tx);

  if (!tx) {
    return {
      ok: false,
      error: "Transaction not found"
    };
  }

  if (tx.meta?.err) {
    return { ok: false, error: "Transaction failed on-chain" };
  }

  const instructions =
    tx.transaction.message.instructions;

  let found = false;

  for (const ix of instructions) {

    if (
      ix.parsed &&
      ix.parsed.type === "transfer"
    ) {

      const info = ix.parsed.info;

      const amountSOL =
        Number(info.lamports) / 1e9;

      console.log("TRANSFER:", info);

      if (
        info.destination === expectedRecipient &&
        Math.abs(amountSOL - expectedAmountSOL) < 0.01
      ) {
        found = true;
        break;
      }
    }
  }

 tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0,
});

  if (!tx || tx.meta.err) {
    return { ok: false, error: "Transaction failed on-chain: " + (tx.meta.err || "Unknown error") };
  }

  const pre = tx.meta.preBalances;
  const post = tx.meta.postBalances;

  // ensure SOL actually moved OUT of sender
  const diff = pre[0] - post[0];

  if (diff <= 0) {
     return { ok: false, error: "Transaction failed on-chain, no sol moved!" };
  }

    //return { success: true };

    return { ok: found };
  }

module.exports = {
  verifySolPayment
};