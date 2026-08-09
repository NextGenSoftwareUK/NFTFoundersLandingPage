// /api/create-payment.js

import Stripe from 'stripe';
//const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
import { createClient } from 'redis';
import crypto from 'crypto';

const TEST_MODE = process.env.TEST_MODE === 'true';
const P = TEST_MODE ? 'test:' : '';

const redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false } });

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

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {

    await ensureRedis();
    console.log("Body:", req.body);
    const {
      //paymentMethodId,
      tier,
      name,
      email,
      wallet,
      testMode
    } = req.body;

    //testMode = true; //TODO: REMEMBER TO REMOVE AFTER!!!!
    const stripe = testMode ? new Stripe(process.env.STRIPE_SECRET_KEY_TEST) : new Stripe(process.env.STRIPE_SECRET_KEY_LIVE);

    console.log("Stripe mode:", testMode ? "TEST" : "LIVE");
    console.log("Secret key prefix:", process.env.STRIPE_SECRET_KEY_TEST?.slice(0,7));

    //console.log("stripe = ", stripe);

    // Basic validation
    // if (!paymentMethodId || !tier || !email) {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'Missing required fields'
    //   });
    // }

    // Pricing by tier
    const prices = {
      genesis: 149900,
      core: 49900,
      supporter: 14900 //50,
    };

    // Check for a custom price override stored in Redis for this email
    let amount = prices[tier];
    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier'
      });
    }

    try {
      const raw = await redis.get(`${P}waitlist:meta:${(email || '').toLowerCase().trim()}`);
      if (raw) {
        const meta = JSON.parse(raw);
        const notExpired = !meta.expiresAt || meta.expiresAt >= Date.now();
        if (notExpired) {
          const op = meta[`${tier}Price`];
          if (op !== null && op !== undefined && op > 0) {
            amount = Math.round(op * 100); // USD → cents
          }
          // op === 0 means free gift — should use /api/gift-order, not this endpoint
        }
      }
    } catch (e) {
      console.warn('[override-lookup]', e.message);
    }

    // Create and confirm payment
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      //payment_method: paymentMethodId,
      //confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      receipt_email: email,
      description: `OASIS ${tier} NFT Mint`,
      metadata: {
        tier,
        email,
        name: name || ''
      }
    });

    console.log("paymentIntent", paymentIntent);

    // // Payment failed
    // if (paymentIntent.status !== 'succeeded') {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'Payment failed'
    //   });
    // }


    const orderId = crypto.randomUUID();

    const order = {
      type: "card",
      orderId,
      wallet: wallet || null,
      tier,
      priceUSD : amount / 100,
      priceSOL: null,
      solPriceUSD: null,
      status: "pending",
      used: false,
      createdAt: Date.now()
    };

    await redis.set(`${P}order:${orderId}`, JSON.stringify(order), { EX: 60 * 15 }); //expire after 15 mins.




// // ==================================================
// // MINT NFT
// // ==================================================



// const chains = {
//   SolanaOASIS: {
//     label: 'Solana',
//     onChain: { value: 30, name: 'SolanaOASIS' },
//     nftStd: { value: 8, name: 'SPL' }
//   },

//   EthereumOASIS: {
//     label: 'Ethereum',
//     onChain: { value: 20, name: 'EthereumOASIS' },
//     nftStd: { value: 1, name: 'ERC721' }
//   }
// };

// // Default chain
// const currentOasisChain = 'SolanaOASIS';

// const chain = chains[currentOasisChain];

// // Build mint payload
// const payload = {
//   Title: `${tier.toUpperCase()} Founder Access`,
//   Description: `OASIS Founder Access NFT — ${tier}`,
//   Symbol: 'OASISFNDR',
//   OnChainProvider: chain.onChain,
//   OffChainProvider: {
//     value: 23,
//     name: 'MongoDBOASIS'
//   },
//   NFTOffChainMetaType: {
//     value: 3,
//     name: 'ExternalJsonURL'
//   },
//   NFTStandardType: chain.nftStd,
//   JSONMetaDataURL: `https://oasisfoundernfts.icu/metadata/tier-${tier}.json`,
//   ImageUrl: `https://www.oasisfoundernfts.icu/img/nft-${tier}-wallet.png`,
//   ThumbnailUrl: `https://www.oasisfoundernfts.icu/img/nft-${tier}-wallet.png`,
//   NumberToMint: 1,
//   StoreNFTMetaDataOnChain: false,
//   SendToAddressAfterMinting: req.body.wallet,
//   WaitTillNFTSent: true,
//   WaitForNFTToSendInSeconds: 60,
//   AttemptToSendEveryXSeconds: 5,
//   MetaData: 
//   {
//     tier,
//     email,
//     orderId: order?.orderId || null,
//     paymentSignature: paymentIntent.id
//   }
// };

// // Call OASIS mint API
// const mintRes = await fetch(
//   'https://www.oasisfoundernfts.icu/api/oasis',
//   {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json'
//     },
//     body: JSON.stringify({ payload })
//   }
// );

// const mintData = await mintRes.json();

// if (!mintRes.ok) {
//   throw new Error(
//     mintData.error || 'NFT mint failed'
//   );
// }

// // Extract tx hash
// const txHash =
//   mintData.result?.result?.web3NFTs?.[0]?.mintTransactionHash ||
//   mintData.result?.result?.web3NFTs?.[0]?.sendNFTTransactionHash ||
//   null;

// console.log('[OASIS] Mint success:', txHash);

    console.log('[OASIS] Payment success:', paymentIntent.id);

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      orderId
    });

    // return res.status(200).json({
    //   success: true,
    //   paymentIntentId: paymentIntent.id,
    //   txHash,
    //   orderId
    // });

  } catch (err) {

    console.error('[OASIS] Payment Error:', err);

    return res.status(500).json({
      success: false,
      error: err.message || 'Server error'
    });

  }
}