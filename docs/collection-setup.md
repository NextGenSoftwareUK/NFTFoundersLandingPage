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

Use Postman (or any REST client) to call `POST https://api.web4.oasisomniverse.one/api/nft/mint-on-chain-collection-nft` with a Bearer token from a prior `/api/avatar/authenticate` call.

> **Note:** Use `mint-on-chain-collection-nft`, not `mint-nft`. The dedicated endpoint mints the Web4 NFT, creates the on-chain collection authority NFT, and then calls `SetCollectionSize` in one step so the collection appears correctly in Phantom's Collections tab (see [InitialSize](#initialsize--sized-collections) below).

Request body:
```json
{
    "InitialSize": 0,
    "InitialSize": 0,
    "FreezeMetadata": false,
    "SendToAddressAfterMinting": "Hoy9VvULRVG16UUvP97D7FkdjFqzTd9uHfr1rYE6wPMd",
    "SendToAvatarAfterMintingId": "",
    "SendToAvatarAfterMintingUsername": "",
    "SendToAvatarAfterMintingEmail": "",
    "Title": "OASIS Founders Collection",
    "Description": "OASIS Founder Access NFTs grant holders exclusive early access to the OASIS platform — a next-generation open metaverse built on Web4 & Web5. Genesis, Core and Supporter tiers each carry unique in-world privileges and governance rights.",
    "Thumbnail": null,
    "ThumbnailUrl": "https://gateway.irys.xyz/52GZMG1UmC9t9eXkDeoT5PaPcy4FP4kjqv7dp4vz5YmF",
    "Price": 0,
    "Discount": 0,
    "NumberToMint": 1,
    "MetaData": null,
    "OnChainProvider": "SolanaOASIS",
    "OffChainProvider": "MongoDBOASIS",
    "StoreNFTMetaDataOnChain": false,
    "NFTOffChainMetaType": "ExternalJSONURL",
    "JSONMetaDataURL": "https://gateway.irys.xyz/Ev2yfRdu86QWbi79Zht57uRSuEUcAAhjHwZLN1fpvGbY",
    "NFTStandardType": "SPL",
    "ImageURL": "https://gateway.irys.xyz/52GZMG1UmC9t9eXkDeoT5PaPcy4FP4kjqv7dp4vz5YmF",
    "Symbol": "OASISFNDR"
}
```

**Important:** `SendToAddressAfterMinting` must be the new OASIS minting wallet address — this makes that wallet both the owner and update authority of the collection NFT.

#### InitialSize & Sized Collections

`InitialSize` maps to Metaplex's `set_and_verify_collection_size` instruction. It stores the declared total supply on-chain inside the collection's master NFT metadata account.

**Why it matters:**
- Phantom wallet and other wallets that use the Helius DAS API read this field to display e.g. "170 items" on the Collections tab
- Without it the collection exists on-chain but has no declared size — wallets may show "?" or not surface the collection at all
- Once set, the collection is considered a **sized collection** by the Metaplex standard

**For Founders NFTs:** set `InitialSize` to `170` — the total number of Founder Access NFTs to ever be minted.

**Can it be changed later?** Yes — `SetCollectionSize` can be called again at any time via `POST /api/nft/set-collection-size`. However:
- Increasing it signals an expanded supply, which undermines the scarcity promise to buyers who paid expecting a 170 max supply
- Decreasing it below the number already minted causes an on-chain inconsistency
- Treat `170` as fixed for Founders NFTs unless there is a deliberate, communicated supply change

**Additional fields:**

| Field | Behaviour |
|---|---|
| `WaitTillCollectionSizeSet` | If `true` (default), the API waits and retries until `SetCollectionSize` confirms on-chain before returning |
| `WaitForCollectionSizeToBeSetInSeconds` | Max time to wait (default 60 s) |
| `AttemptToSetCollectionSizeEveryXSeconds` | Retry interval (default 1 s) |

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
| `COLLECTION_PUBLIC_KEY_LIVE` | `EmWwo8qWdGemfGPeAa3MKKEJAn5C2WSevUHwJynU9gps` The mainnet collection mint address |
| `COLLECTION_PUBLIC_KEY_TEST` | `DAvRirJX9N2bBCKMpxmVTkMHXs7Uc7TwPZwJqZMn5S8P` The devnet collection mint address |

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
| `kEGrGguhZYn2VFAW6GzNLQMce4rSHZd2G3AYsQCBydX` | Previous OASIS minting wallet | **Compromised 2026-08-17 — do not use** |
| `Hoy9VvULRVG16UUvP97D7FkdjFqzTd9uHfr1rYE6wPMd` | Current OASIS minting wallet | Used for all new mints from 2026-08-18 |

---

## History

| Date | Action | Collection Key |
|---|---|---|
| ~early 2025 | Original collection created (live) | `BV3M26PqhztUpaXtesmYpG3EP2usWRYHL76QLiNWGEgs` |
| 2026-07-11 | New live collection created after old wallet compromised | `9vgkKES9Cph9ukZPxXZKEV1uvbHenbofFi3BqXhP456r` |
| 2026-07-12 | New dev/test collection created via dev API | `HrrzdjdLgsttkyM66uEAvsUWkCBukXx5sbGEaznjTdxF` |
| 2026-08-09 | New dev/test collection with fixed collection size created via dev API | `7PYZ18VxNaPeNyTtfoWn9eo2r4ibq5ixzceR7jcaFxhx` |
| 2026-08-09 | New live collection created with fixed collection size via dev API | `2uVFTptrWeQD4iunhNQKyMqor7eNQKe5RuiQfVM7R4eu` |
| 2026-08-17 | New devnet collection after wallet compromise — Arweave metadata (frozen, wrong gateway) | `32QH9iMunepwzMCvSDoHvwxUFFmCB92bsDGjCzjNZxtY` |
| 2026-08-17 | New devnet collection — Irys gateway metadata, mutable | `DAvRirJX9N2bBCKMpxmVTkMHXs7Uc7TwPZwJqZMn5S8P` |
| 2026-08-18 | New mainnet collection — Irys gateway metadata, mutable | `EmWwo8qWdGemfGPeAa3MKKEJAn5C2WSevUHwJynU9gps` |


Due to some odd issues with Vercel env variables not working correctly (needs further investigation) to switch between dev/live:

1. Change SOL connection string in OASISDNA in Railway to dev/main net.
2. In oasis.js vercel api backend function for founders make sure testMode is true/false. (should be automatic now with testMode env var in vercel)
3. Make sure in oasis.js that CollectionPublicKey is set to the correct key for devnet/mainnet.
4. When going LIVE make sure you set the correct price in create-sol-order.js and createPayment.js (for testing these are set to 0 or near 0!).
5. Remember to switch the line in config.js to use stripe live/test keys. (should be automatic now with testMode env var in vercel)
6. Remember to make sure stripe is in live/test mode in the verify-card-payment.js line 30. (should be automatic now with testMode env var in vercel)
7. Also make sure testMode is set to true/false in Vercel!
8. If testing creating and activating new users make sure you delete the test user account from MongoDB first for Avatar and AvatarDetail! ;-)
