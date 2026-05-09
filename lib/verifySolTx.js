const solanaWeb3 = require("@solana/web3.js");

async function verifySolPayment({
  signature,
  expectedRecipient,
  expectedAmountSOL
}) {

  // const connection = new solanaWeb3.Connection(
  //   "https://rpc.ankr.com/solana_devnet",
  //   "confirmed"
  // );

  const connection = new solanaWeb3.Connection(
    "https://solana-devnet.g.alchemy.com/v2/2gYC0H1CyjRsQnrlyNEReY",
    "confirmed"
  );

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

  return { ok: found };
}

module.exports = {
  verifySolPayment
};