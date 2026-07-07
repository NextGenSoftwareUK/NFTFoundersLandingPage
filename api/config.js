export default function handler(req, res) {
  const testMode = process.env.TEST_MODE === 'true';

  res.status(200).json({
    testMode,
    // stripePk: testMode ? process.env.STRIPE_PK_TEST : process.env.STRIPE_PK_LIVE,
    stripePk: process.env.STRIPE_PK_TEST, //TODO: REMEMBER TO REMOVE AFTER TESTING!!!
    evmReceiver: process.env.EVM_RECEIVER,
    btcAddr: process.env.BTC_ADDR,
    solAddr: process.env.TREASURY_WALLET_SOL,
    usdtContracts: testMode ? {
      ETH:  process.env.USDT_ETH_TEST,
      BNB:  process.env.USDT_BNB_TEST,
      MATIC: process.env.USDT_MATIC_TEST,
    } : {
      ETH:  process.env.USDT_ETH_LIVE,
      BNB:  process.env.USDT_BNB_LIVE,
      MATIC: process.env.USDT_MATIC_LIVE,
    },
    oasis: {
      apiUrl:   testMode ? process.env.OASIS_API_URL_TEST : process.env.OASIS_API_URL_LIVE,
      username: process.env.OASIS_USERNAME,
      password: process.env.OASIS_PASSWORD,
      avatarId: process.env.OASIS_AVATAR_ID,
      imageUrl: process.env.OASIS_IMAGE_URL,
    }
  });
}