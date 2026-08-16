# Getting OASIS Founder NFTs Visible in Phantom (Mainnet)

## Why NFTs Don't Show in Phantom

Phantom uses **Helius DAS** to index and display NFTs. Helius assigns a spam score to every collection based on on-chain state and third-party reputation signals. A low/unknown score causes Phantom to hide the NFTs from the Collectibles tab entirely.

On-chain verification is already complete (SetAndVerifySizedCollectionItem instruction 32). The remaining work is reputation/trust signals.

---

## Collection Details

- **Mint address:** `2uVFTptrWeQD4iunhNQKyMqor7eNQKe5RuiQfVM7R4eu`
- **Name:** OASIS Founders Collection
- **Symbol:** OASISFNDR
- **Metadata PDA:** `4GXY7BjHzNSCMFyRwFBVqYkrfF1YUez5epbsFfAmsZm7`
- **Metadata URI:** `https://founders.oasisomniverse.one/metadata/founder-collection.json`

---

## Step 1 — Fix Metadata Hygiene (Do First)

The current JSON metadata at the URI has issues that will hurt RugCheck and Helius scores. Fix these before submitting to any marketplace.

### Issues Found

| Field | Current | Required |
|---|---|---|
| `external_url` | **missing** | Must be set, e.g. `https://founders.oasisomniverse.one` |
| `image` | HTTPS URL | Should be Arweave (`ar://...`) or IPFS for permanence |
| `description` | "OASIS Founder Access NFTs" (too short) | 2-3 sentences explaining the collection |

### Fix

Edit `founder-collection.json` (served from your domain):

```json
{
  "name": "OASIS Founders Collection",
  "symbol": "OASISFNDR",
  "description": "OASIS Founder Access NFTs grant holders exclusive early access to the OASIS platform — a next-generation open metaverse. Genesis, Core and Supporter tiers each carry unique in-world privileges and governance rights.",
  "image": "https://founders.oasisomniverse.one/img/nft-founder-collection.png",
  "external_url": "https://founders.oasisomniverse.one",
  "seller_fee_basis_points": 500,
  "properties": {
    "category": "image",
    "creators": [...]
  }
}
```

> **Note on Arweave:** If you want permanent storage, upload the image and JSON to Arweave via [nft.storage](https://nft.storage) or [Bundlr](https://bundlr.network) and update the on-chain URI. This requires an on-chain metadata update transaction. For now, fixing `external_url` and description is the priority.

---

## Step 2 — RugCheck

Go to **rugcheck.xyz** and paste the collection mint address:
```
2uVFTptrWeQD4iunhNQKyMqor7eNQKe5RuiQfVM7R4eu
```

This shows you the current risk score and exactly what flags are being raised. Fix those before submitting to marketplaces. A "Good" score is the target.

Common flags and fixes:
- **No external_url** → fix in metadata JSON (Step 1)
- **No social links** → add Twitter/Discord to metadata or marketplace profile
- **Low holder count** → normal for new collections, not fixable immediately
- **No marketplace listing** → fixed by Steps 3 & 4

---

## Step 3 — Magic Eden Collection Submission

Magic Eden is the largest Solana NFT marketplace. A verified listing there is the single biggest signal to Helius/Phantom.

1. Go to **magiceden.io** and find "Submit Collection" or "Creators" in the nav
2. You will need:
   - Collection mint address: `2uVFTptrWeQD4iunhNQKyMqor7eNQKe5RuiQfVM7R4eu`
   - Website URL: `https://founders.oasisomniverse.one`
   - Twitter/X account for OASIS
   - Discord invite link
   - Banner image (1400×400px recommended)
   - Logo/thumbnail image (400×400px)
   - Description of the collection
3. Approval typically takes 3-7 days

---

## Step 4 — Tensor Collection Submission

Tensor is the second major Solana NFT marketplace (often preferred by traders).

1. Go to **tensor.trade** and look for "Creator Hub" or collection submission
2. Same assets needed as Magic Eden (Step 3)
3. Approval is often faster than ME

---

## Step 5 — Helius Force Re-index

After ME/Tensor listings are live, force Helius to re-index the collection so Phantom picks up the new reputation signals immediately.

If you have a Helius API key set in Vercel env (`HELIUS_API_KEY` or similar):

```js
// Force re-index a single asset
await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1,
    method: 'getAsset',
    params: { id: '2uVFTptrWeQD4iunhNQKyMqor7eNQKe5RuiQfVM7R4eu' }
  })
});
```

Or use the Helius dashboard at **helius.dev** to trigger a re-index manually.

---

## Expected Timeline

| Action | Effect in Phantom |
|---|---|
| Fix metadata JSON | Immediate (Helius re-fetches URI within hours) |
| RugCheck "Good" rating | Within 24h of score update |
| Magic Eden listing approved | Within 24-48h of approval |
| Tensor listing approved | Within 24h of approval |

---

## Individual NFT Metadata

Each minted NFT also needs good metadata. The same hygiene rules apply:
- `external_url` set
- Image on a permanent host
- `attributes` array populated with tier info
- Creator verified on-chain (already done via minting flow)

The minting flow in `api/oasis.js` handles this automatically. If early-minted NFTs predate the fix, they may need individual metadata updates.
