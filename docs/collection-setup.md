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

> TODO: Document exact menu path / button in the OASIS admin panel used to create a collection NFT
>
> Things to note:
> - What name / symbol was used for the collection NFT?
> - Was an image uploaded? (if so, which one — save it to `public/img/` in this repo)
> - Was a metadata JSON URL provided? (if so, note it here)
> - Which wallet was selected as the minting/update authority?

### 3. Note the Collection Public Key

Once the collection NFT is created, copy its **mint address** (public key). This is a base-58 Solana address, e.g. `BV3M26PqhztUpaXtesmYpG3EP2usWRYHL76QLiNWGEgs`.

> TODO: Paste the new key here once created

You can verify it on Solana Explorer:
- Mainnet: `https://explorer.solana.com/address/<KEY>`
- Devnet: `https://explorer.solana.com/address/<KEY>?cluster=devnet`

### 4. Update Vercel Environment Variables

In the Vercel dashboard for this project, set:

| Variable | Value |
|---|---|
| `COLLECTION_PUBLIC_KEY_LIVE` | The mainnet collection mint address |
| `COLLECTION_PUBLIC_KEY_TEST` | The devnet collection mint address (if separate) |

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
| New wallet | Current OASIS minting wallet | Used for all new mints |

> TODO: Add wallet public addresses above (never private keys)

---

## History

| Date | Action | Collection Key |
|---|---|---|
| ~early 2025 | Original collection created | `BV3M26PqhztUpaXtesmYpG3EP2usWRYHL76QLiNWGEgs` |
| TBD | New collection created after wallet change | TBD |
