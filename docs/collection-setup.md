# NFT Collection Setup — OASIS Platform

This document covers how to create a new Solana NFT collection on the OASIS platform and wire it up to the Founders minting flow. Follow these steps any time the collection needs to be recreated (e.g. after a wallet change).

---

## Background

Solana NFTs using the Metaplex standard support "certified collections". A collection is itself an NFT whose **mint address** (public key) is referenced by every NFT minted into it. The collection NFT must be owned/signed by the **same wallet** used to mint new NFTs — if the wallets differ, collection verification fails and the NFT appears without its image in Phantom and Solana Explorer.

The current collection public key is stored in Vercel env vars:
- `COLLECTION_PUBLIC_KEY_LIVE` — mainnet
- `COLLECTION_PUBLIC_KEY_TEST` — devnet

---

## When to redo this

- The minting wallet has changed (e.g. old wallet compromised)
- The collection NFT was created under a different wallet than the one now used by OASIS
- NFTs are minting successfully but images don't appear in Phantom / Solana Explorer

---

## Steps

### 1. Log into the OASIS Platform

> TODO: Add URL and which account to log in with

### 2. Create the Collection NFT

Use Postman (or any REST client) to call `POST https://api.web4.oasisomniverse.one/api/nft/mint-nft` with a Bearer token from a prior `/api/avatar/authenticate` call.

Request body:
```json
{
    "SendToAddressAfterMinting": "<new minting wallet address>",
    "SendToAvatarAfterMintingId": "",
    "SendToAvatarAfterMintingUsername": "",
    "SendToAvatarAfterMintingEmail": "",
    "Title": "OASIS Founders Collection",
    "Description": "OASIS Founder Access NFTs",
    "Thumbnail": null,
    "ThumbnailUrl": "https://founders.oasisomniverse.one/img/nft-founder-collection.png",
    "Price": 0,
    "Discount": 0,
    "NumberToMint": 1,
    "MetaData": null,
    "OnChainProvider": "SolanaOASIS",
    "OffChainProvider": "MongoDBOASIS",
    "StoreNFTMetaDataOnChain": false,
    "NFTOffChainMetaType": "ExternalJSONURL",
    "JSONMetaDataURL": "https://founders.oasisomniverse.one/metadata/founder-collection.json",
    "NFTStandardType": "SPL",
    "ImageURL": "https://founders.oasisomniverse.one/img/nft-founder-collection.png",
    "Symbol": "OASISFNDR"
}
```

**Important:** `SendToAddressAfterMinting` must be the new OASIS minting wallet address — this makes that wallet both the owner and update authority of the collection NFT.

### 3. Note the Collection Public Key

Once the collection NFT is created, copy its **mint address** (public key). This is a base-58 Solana address, e.g. `BV3M26PqhztUpaXtesmYpG3EP2usWRYHL76QLiNWGEgs`.

The mint address is in the response message as **NFT Address**. Example from 2026-07-11 recreation: `9vgkKES9Cph9ukZPxXZKEV1uvbHenbofFi3BqXhP456r`

You can verify it on Solana Explorer:
- Mainnet: `https://explorer.solana.com/address/<KEY>`
- Devnet: `https://explorer.solana.com/address/<KEY>?cluster=devnet`

### 4. Update Vercel Environment Variables

In the Vercel dashboard for this project, set:

| Variable | Value |
|---|---|
| `COLLECTION_PUBLIC_KEY_LIVE` | FEarZUmzY6CidJPkufVbiEEvxBFYYY5bfSNpvZ5sp5Zj The mainnet collection mint address |
| `COLLECTION_PUBLIC_KEY_TEST` | HrrzdjdLgsttkyM66uEAvsUWkCBukXx5sbGEaznjTdxF The devnet collection mint address (if separate) |

Trigger a redeploy after saving.

### 5. Test a Mint

1. Set `TEST_MODE=true` in Vercel and redeploy
2. Complete a test mint (card or SOL) on the dev site
3. Check the receiving wallet in Phantom — the NFT should appear under the NFTs tab with the correct image
4. Check on Solana Explorer devnet that the NFT shows the collection as "Verified"

### 6. Go Live

1. Set `TEST_MODE=false` in Vercel
2. Repeat a test mint on mainnet to confirm
3. Update this document with the final collection public key in Step 3 above

---

## Wallet Reference

| Wallet | Purpose | Notes |
|---|---|---|
| Old wallet | Previous collection creator | **Compromised — do not use** |
| `kEGrGguhZYn2VFAW6GzNLQMce4rSHZd2G3AYsQCBydX` | Current OASIS minting wallet | Used for all new mints from 2026-07-11 |

---

## History

| Date | Action | Collection Key |
|---|---|---|
| ~early 2025 | Original collection created (live) | `BV3M26PqhztUpaXtesmYpG3EP2usWRYHL76QLiNWGEgs` |
| 2026-07-11 | New live collection created after old wallet compromised | `9vgkKES9Cph9ukZPxXZKEV1uvbHenbofFi3BqXhP456r` |
| 2026-07-12 | New dev/test collection created via dev API | `HrrzdjdLgsttkyM66uEAvsUWkCBukXx5sbGEaznjTdxF` |


Due to some odd issues with Vercel env variables not working correctly (needs further investigation) to switch between dev/live:

1. Change SOL connection string in OASISDNA in Railway to dev/main net.
2. In oasis.js vercel api backend function for founders make sure testMode is true/false.
3. Make sure in oasis.js that CollectionPublicKey is set to the correct key for devnet/mainnet.
4. When going LIVE make sure you set the correct price in create-sol-order.js and createPayment.js (for testing these are set to 0 or near 0!).
5. Remember to switch the line in config.js to use stripe live/test keys.

6. If testing creating and activating new users make sure you delete the test user account from MongoDB first for Avatar and AvatarDetail! ;-)
