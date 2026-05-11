const solanaWeb3 = require("@solana/web3.js");

async function verifySolPayment({signature,expectedRecipient,expectedAmountSOL,expectedSender=null,testMode}) {

  try {

    const connection = testMode
      ? new solanaWeb3.Connection('https://solana-devnet.g.alchemy.com/v2/2gYC0H1CyjRsQnrlyNERe','confirmed')
      : new solanaWeb3.Connection('https://solana-mainnet.g.alchemy.com/v2/2gYC0H1CyjRsQnrlyNERe','confirmed');

    console.log("VERIFYING SIGNATURE:", signature);

    const tx = await connection.getParsedTransaction(signature,{
      maxSupportedTransactionVersion:0
    });

    console.log("TX:", tx);

    if (!tx) {
      return { ok:false,error:"Transaction not found" };
    }

    if (tx.meta?.err) {
      return { ok:false,error:"Transaction failed on-chain" };
    }

    const instructions = tx.transaction.message.instructions;

    let validTransfer = null;
    let failReason = "No valid transfer found";

    for (const ix of instructions) {

      if (ix.parsed && ix.parsed.type === "transfer") {

        const info = ix.parsed.info;

        const source = info.source;
        const destination = info.destination;
        const amountSOL = Number(info.lamports) / 1e9;

        console.log("TRANSFER:", {
          source,
          destination,
          amountSOL
        });

        // BLOCK SELF TRANSFERS
        if (source === destination) {
          failReason = "Self-transfer blocked";
          console.log(failReason);
          continue;
        }

        // CHECK RECIPIENT
        if (destination !== expectedRecipient) {
          failReason = `Wrong recipient: ${destination}`;
          console.log(failReason);
          continue;
        }

        // OPTIONAL SENDER CHECK
        if (expectedSender && source !== expectedSender) {
          failReason = `Wrong sender: ${source}`;
          console.log(failReason);
          continue;
        }

        // CHECK AMOUNT
        const diff = Math.abs(amountSOL - expectedAmountSOL);

        if (diff > 0.0001) {
          failReason = `Wrong amount: ${amountSOL} SOL`;
          console.log(failReason);
          continue;
        }

        validTransfer = {
          source,
          destination,
          amountSOL
        };

        break;
      }
    }

    if (!validTransfer) {
      return { ok:false,error:failReason };
    }

    // VERIFY BALANCE CHANGE
    const keys = tx.transaction.message.accountKeys;

    let recipientIndex = -1;

    for (let i = 0; i < keys.length; i++) {

      const k = keys[i];

      const address =
        typeof k === "string"
          ? k
          : k.pubkey
            ? k.pubkey.toString()
            : k.toString();

      if (address === expectedRecipient) {
        recipientIndex = i;
        break;
      }
    }

    if (recipientIndex === -1) {
      return { ok:false,error:"Recipient account missing" };
    }

    const pre = tx.meta.preBalances[recipientIndex];
    const post = tx.meta.postBalances[recipientIndex];

    const receivedLamports = post - pre;

    const expectedLamports = Math.floor(
      expectedAmountSOL * solanaWeb3.LAMPORTS_PER_SOL
    );

    console.log({
      pre,
      post,
      receivedLamports,
      expectedLamports
    });

    if (receivedLamports < expectedLamports * 0.999) {
      return {
        ok:false,
        error:`Recipient only received ${receivedLamports / 1e9} SOL`
      };
    }

    return {
      ok:true,
      signature,
      transfer:validTransfer
    };

  } catch (e) {

    console.error("verifySolPayment error:", e);

    return {
      ok:false,
      error:e.message || "Verification failed"
    };
  }
}

module.exports = {
  verifySolPayment
};


// const solanaWeb3 = require("@solana/web3.js");

// async function verifySolPayment({
//   signature,
//   expectedRecipient,
//   expectedAmountSOL,
//   testMode
// }) {

//   const connection = testMode
//         ? new solanaWeb3.Connection('https://solana-devnet.g.alchemy.com/v2/2gYC0H1CyjRsQnrlyNERe', 'confirmed')
//         : new solanaWeb3.Connection('https://solana-mainnet.g.alchemy.com/v2/2gYC0H1CyjRsQnrlyNERe', 'confirmed');

//   console.log("Connection:", connection);

//   const tx = await connection.getParsedTransaction(
//     signature,
//     {
//       maxSupportedTransactionVersion: 0
//     }
//   );

//   console.log("TX:", tx);

//   if (!tx) {
//     return {
//       ok: false,
//       error: "Transaction not found"
//     };
//   }

//   if (tx.meta?.err) {
//     return { ok: false, error: "Transaction failed on-chain" };
//   }

//   const instructions =
//     tx.transaction.message.instructions;

//   let found = false;

//   for (const ix of instructions) {

//     if (
//       ix.parsed &&
//       ix.parsed.type === "transfer"
//     ) {

//       const info = ix.parsed.info;

//       const amountSOL =
//         Number(info.lamports) / 1e9;

//       console.log("TRANSFER:", info);

//       if (
//         info.destination === expectedRecipient &&
//         Math.abs(amountSOL - expectedAmountSOL) < 0.01
//       ) {
//         found = true;
//         break;
//       }
//     }
//   }

//   const tx2 = await connection.getTransaction(signature, {
//     maxSupportedTransactionVersion: 0,
//   });

//   if (!tx2 || tx2.meta.err) {
//     return { ok: false, error: "Transaction failed on-chain: " + (tx2.meta.err || "Unknown error") };
//   }

//   const pre = tx2.meta.preBalances;
//   const post = tx2.meta.postBalances;

//   // ensure SOL actually moved OUT of sender
//   const diff = pre[0] - post[0];

//   if (diff <= 0) {
//      return { ok: false, error: "Transaction failed on-chain, no sol moved!" };
//   }

//   return { ok: true };

//     return { ok: found };
//   }

// module.exports = {
//   verifySolPayment
// };