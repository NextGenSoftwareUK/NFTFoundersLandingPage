// /api/create-payment.js

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {

    const {
      paymentMethodId,
      tier,
      name,
      email
    } = req.body;

    // Basic validation
    if (!paymentMethodId || !tier || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Pricing by tier
    const prices = {
      genesis: 149900,   // $1,499
      core: 49900,    // $499
      supporter: 50//14900     // $149
    };

    const amount = prices[tier];

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier'
      });
    }

    // Create and confirm payment
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',

      payment_method: paymentMethodId,

      confirm: true,

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

    // Payment failed
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        error: 'Payment failed'
      });
    }

// ==================================================
// MINT NFT
// ==================================================

const chains = {
  SolanaOASIS: {
    label: 'Solana',
    onChain: { value: 30, name: 'SolanaOASIS' },
    nftStd: { value: 8, name: 'SPL' }
  },

  EthereumOASIS: {
    label: 'Ethereum',
    onChain: { value: 20, name: 'EthereumOASIS' },
    nftStd: { value: 1, name: 'ERC721' }
  }
};

// Default chain
const currentOasisChain = 'SolanaOASIS';

const chain = chains[currentOasisChain];

// Build mint payload
const payload = {
  Title: `${tier.toUpperCase()} Founder Access`,
  Description: `OASIS Founder Access NFT — ${tier}`,
  Symbol: 'OASISFNDR',

  OnChainProvider: chain.onChain,

  OffChainProvider: {
    value: 23,
    name: 'MongoDBOASIS'
  },

  NFTOffChainMetaType: {
    value: 3,
    name: 'ExternalJsonURL'
  },

  NFTStandardType: chain.nftStd,

  JSONMetaDataURL: `https://oasisfoundernfts.icu/metadata/tier-${tier}.json`,

  ImageUrl: `https://www.oasisfoundernfts.icu/img/nft-${tier}-wallet.png`,

  ThumbnailUrl: `https://www.oasisfoundernfts.icu/img/nft-${tier}-wallet.png`,

  NumberToMint: 1,

  StoreNFTMetaDataOnChain: false,

  SendToAddressAfterMinting: req.body.wallet,

  WaitTillNFTSent: true,

  WaitForNFTToSendInSeconds: 60,

  AttemptToSendEveryXSeconds: 5,

  MetaData: {
    tier,
    email
  }
};

// Call OASIS mint API
const mintRes = await fetch(
  'https://www.oasisfoundernfts.icu/api/oasis',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ payload })
  }
);

const mintData = await mintRes.json();

if (!mintRes.ok) {
  throw new Error(
    mintData.error || 'NFT mint failed'
  );
}

// Extract tx hash
const txHash =
  mintData.result?.result?.web3NFTs?.[0]?.mintTransactionHash ||
  mintData.result?.result?.web3NFTs?.[0]?.sendNFTTransactionHash ||
  null;

console.log('[OASIS] Mint success:', txHash);

    console.log('[OASIS] Payment success:', paymentIntent.id);

    return res.status(200).json({
      success: true,
      paymentIntentId: paymentIntent.id,
      txHash
    });

  } catch (err) {

    console.error('[OASIS] Payment Error:', err);

    return res.status(500).json({
      success: false,
      error: err.message || 'Server error'
    });

  }
}