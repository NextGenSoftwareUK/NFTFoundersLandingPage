# OASIS Founders NFT — Solana Technical Journey & Decisions

Internal record of everything done to set up, verify, and secure the OASIS Founders NFT collection on Solana mainnet.

---

## 1. Current Status (as of July 2026)

| Concern | Status |
|---|---|
| Collection NFT created | ✅ Mainnet |
| Collection sized (SetCollectionSize) | ✅ Instruction 33 applied |
| Individual NFTs verified to collection | ✅ SetAndVerifyCollectionItem (ix 32) |
| Metadata immutable (isMutable=false) | ✅ UpdateMetadataAccountV2 (ix 15) |
| Mint/Freeze Authority revoked | ❌ Not possible — held by Master Edition PDA (see §6) |
| RugCheck Mint/Freeze Authority flags | ❌ False positives — structural Metaplex limitation |
| Phantom / Solflare display | ⏳ Helius DAS indexing in progress |
| Solscan / Explorer | ✅ Fully visible and verified |
| OASIS Web4 Wallet (OPORTAL) | ✅ Fully visible and usable |

---

## 2. Collection Architecture

**Collection NFT address:** `FEarZUmzY6CidJPkufVbiEEvxBFYYY5bfSNpvZ5sp5Zj`

The collection is a **sized (fixed) collection** — `SetCollectionSize` (instruction 33) was applied after creation. This is required for Phantom and Solflare to group NFTs under the Collections tab in the wallet UI. Without it, the collection size field is `null` and DAS-based wallets ignore it.

### Why sized matters

- Phantom and Solflare both use the Helius DAS API to fetch NFT data.
- The DAS API requires a sized collection (`collectionDetails.size` to be non-null) to properly group NFTs.
- Unsized collections existed before the Metaplex v1.1 standard; new wallets require sized.

---

## 3. Mint Flow (OASIS2 — SolanaService.cs)

Each NFT is minted via `NextGenSoftware.OASIS.API.Providers.SOLANAOASIS.Infrastructure.Services.Solana.SolanaService.cs`.

### Steps per mint

1. **Upload metadata to Arweave** (via `MetaDataClient`).
2. **`CreateNFT`** via Metaplex UMI — this internally calls:
   - `CreateMetadataAccountV3` — creates the Metadata PDA with `isMutable=false`.
   - `CreateMasterEditionV3` — enforces supply=1, **transfers Mint Authority and Freeze Authority to the Master Edition PDA**.
3. **`SetAndVerifyCollectionItem`** (instruction 32) — links the NFT to the collection and verifies it on-chain.
   - ⚠️ **Must be instruction 32, NOT instruction 25.** Instruction 25 (`VerifyCollection`) fails with error `0x66` on sized collections. Instruction 32 (`SetAndVerifyCollectionV2` / `SetAndVerifyCollection`) is the correct one for sized collections.
4. **`WaitTillNFTVerified`** — retry loop checking the on-chain `verified` flag in the collection record.
5. **`FreezeMetadata`** (optional, `FreezeMetadata: true` in request) — calls `UpdateMetadataAccountV2` (ix 15) to set `isMutable=false`. See §5.
6. **`RevokeTokenAuthorities`** — DISABLED. See §6.

### Key code locations (OASIS2 / Development branch)

| File | What changed |
|---|---|
| `SolanaService.cs` | `FreezeMetadataAsync`, `MintNftAsync` call sites |
| `IMintWeb3NFTRequest.cs` | `FreezeMetadata` property (disabled: `RevokeTokenAuthorities`) |
| `IMintWeb4NFTRequest.cs` | Same |
| `MintWeb3NFTRequest.cs` | Same |
| `MintWeb4NFTRequest.cs` | Same |
| `MintAndPlaceWeb4GeoSpatialNFTRequest.cs` | Same |
| `MintNFTTransactionRequest.cs` | Same |
| `NftController.cs` | Mapped `FreezeMetadata` from HTTP model |
| `NFTManager.cs` | Synced `FreezeMetadata` in CloneWeb4NFTRequest (~L3288) and web3Request loop (~L3500) |

---

## 4. Post-Mint Scripts (`scripts/` in NFTFoundersLandingPage)

| Script | Purpose | Status |
|---|---|---|
| `verify-nft-collection.mjs` | Standalone collection verification via UMI | Works |
| `freeze-metadata.mjs` | Sets `isMutable=false` via UpdateMetadataAccountV2 | Works |
| `revoke-token-authorities.mjs` | Attempts SPL Token SetAuthority to revoke Mint/Freeze Authority | Fails — see §6 |

All scripts use UMI with `@metaplex-foundation/umi-bundle-defaults`, connecting to mainnet via Helius RPC.

---

## 5. FreezeMetadata — How It Works

`FreezeMetadataAsync` in `SolanaService.cs` sends **UpdateMetadataAccountV2 (instruction 15)**.

### Borsh instruction layout

```
[15, 0, 0, 0, 1, 0]
```

- Byte 0: `15` = instruction discriminator for UpdateMetadataAccountV2.
- Bytes 1–4: Borsh option for `UpdateMetadataAccountArgsV2` = `[0, 0, 0, 1]` (no new data, isMutable=true→flip).
- Byte 5: `0` = `isMutable: false` (the mutable flag itself).

### Accounts required

1. `metadata` PDA — writable.
2. `updateAuthority` (our OASIS account) — signer.

### Result

Sets `isMutable = false` permanently on the Token Metadata account. **This is one-way — it cannot be undone.** No authority can change it back.

---

## 6. RevokeTokenAuthorities — Why It Fails

### What we attempted

After mint, send SPL Token `SetAuthority` (opcode 6) instructions:
- Set Mint Authority → `null`
- Set Freeze Authority → `null`

This is standard for fungible tokens to signal "no more minting possible."

### Why it always fails with 0x4 OwnerMismatch

When Metaplex calls `CreateMasterEditionV3` (inside `CreateNFT`), it transfers **Mint Authority and Freeze Authority to the Master Edition PDA**:

```
PDA seeds: ["metadata", TOKEN_METADATA_PROGRAM_ID, MINT_ADDRESS, "edition"]
```

This PDA has no private key. It is controlled entirely by the Metaplex Token Metadata program. When we then attempt `SetAuthority` with our wallet as signer, the SPL Token program checks `current_authority == signer` — it is not, it is the PDA — so it returns `0x4 OwnerMismatch`.

### Confirmed on mainnet

- NFT: `3VztN8wgK8swJmDUfybdQ8iZZXr9oKrZBVetovvUVund`
- Actual Mint Authority on-chain: `6YYMz75u8Ve4ja1U1VGdz6oh6gGkzbjxqjnu69gWEMyk`
- `findMasterEditionPda(mintAddress)` → `6YYMz75u8Ve4ja1U1VGdz6oh6gGkzbjxqjnu69gWEMyk` ✓ confirmed match.

### Why RugCheck flags this

RugCheck was designed to detect rug-pull risk on **fungible tokens** (meme coins), where a live Mint Authority means the creator can dilute supply. It applies the same logic to Metaplex NFTs, producing false positives:

- Every standard Metaplex NFT collection (DeGods, Mad Lads, Okay Bears, etc.) has exactly these same flags.
- The Master Edition PDA **enforces** supply=1 — it is the mechanism that prevents more minting, not a risk.
- There is nothing we or anyone can do about this at the SPL token level.

**Workaround that does work:** `FreezeMetadata` (§5) removes the "Mutable metadata" flag by setting `isMutable=false` on the Token Metadata account.

### Code status

`RevokeTokenAuthorities` is commented out in every layer of the stack (interfaces, models, controller, NFTManager, SolanaService) with explanatory comments pointing to `SolanaService.cs`.

---

## 7. Helius DAS API — Why Phantom/Solflare Don't Show NFTs

Phantom and Solflare do not read NFT data directly from chain. They query the **Helius DAS (Digital Asset Standard) API**, which:

1. Crawls Solana blocks asynchronously.
2. Builds a searchable off-chain index of NFTs, their metadata, and collection memberships.
3. Can take **24h–72h (or longer)** to index newly minted or updated NFTs.

**This is not unique to OASIS.** It is a known limitation of the current Solana wallet ecosystem.

### What triggers re-indexing

- Natural crawl (time).
- Listing on Magic Eden or Tensor (marketplaces trigger immediate Helius re-crawl).
- Direct request to Helius support via Discord.

### Engagement plan

Contact: Helius Discord, Phantom developer relations, Solflare developer relations.

---

## 8. NFT Mint Addresses

### Mainnet (real NFTs)

| Address | Notes |
|---|---|
| `3VztN8wgK8swJmDUfybdQ8iZZXr9oKrZBVetovvUVund` | Tested revoke (failed as expected); metadata frozen |
| `4cKugJX8...` | Needs freeze-metadata script run |
| `FPS69Aj...` | Needs freeze-metadata script run |

### Devnet only (cannot rescue)

| Address | Notes |
|---|---|
| `FFN4NevW...` | Minted while API was pointing at devnet — not on mainnet |
| `HTv2CN21...` | Same |

These devnet NFTs cannot be "moved" to mainnet. They are separate tokens on the devnet cluster and have no value or utility.

---

## 9. Who We're Engaging With

| Party | Why |
|---|---|
| **Phantom** | Direct display of NFT; re-indexing; correct collection grouping |
| **Solflare** | Same |
| **Helius** | DAS API re-indexing for the collection |
| **RugCheck** | Report false positive classification of Metaplex Mint/Freeze Authority flags |
| **Magic Eden / Tensor** | Listing triggers Helius re-crawl; also collector visibility |
| **Jupiter** | NFT visibility in aggregator |
| **CoinGecko** | Collection/NFT data listing |
| **Bluprynt** | Independent NFT verifier |
| **Solana Foundation** | Awareness; possible fast-track for verified projects |

---

## 10. Key Error Reference

| Error | Cause | Resolution |
|---|---|---|
| `SendTransactionError 0x4` (OwnerMismatch) | Signer is not the current Mint/Freeze Authority | Cannot fix — authority is Master Edition PDA. Disabled `RevokeTokenAuthorities`. |
| `0x66` (VerifyCollection fails) | Used instruction 25 on a sized collection | Use instruction 32 (`SetAndVerifyCollectionItem`). |
| NFT not in Phantom/Solflare | Helius DAS not yet indexed | Wait 24–72h, or trigger re-index via Helius/marketplace. |
| `Cannot find module revoke-token-authorities.mjs` | Script existed on main but not dev | Cherry-picked commit from main to dev; resolved conflict. |
