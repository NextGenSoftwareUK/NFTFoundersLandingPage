# OASIS Founders NFT — Verification & Status

**Your OASIS Founders NFT is genuine, verified, and live on Solana mainnet.**

If it isn't showing up in Phantom or Solflare yet, or you've seen a RugCheck warning, this page explains exactly what is happening and why your NFT is completely legitimate.

---

## Current Status

| | Status |
|---|---|
| Collection | Verified on-chain |
| Metadata | Permanently frozen |
| OASIS Web4 Wallet (OPORTAL) | Fully visible & usable |
| Phantom / Solflare | Indexing in progress |

---

## Where You Can View Your NFT Right Now

Your NFT is live on Solana mainnet and visible in multiple places. The **OASIS Portal** is the primary home — this is where its Web4 utility lives and it is the definitive record of your ownership.

- **OASIS Portal** — `oportal.oasisomniverse.one` — primary home, full utility, verified ownership
- **Solscan.io** — full on-chain detail, verified collection badge, metadata
- **Solana Explorer** — `explorer.solana.com` — official Solana Foundation explorer
- **Solana FM** — `solana.fm` — alternative explorer with full transaction and metadata history

---

## Why Phantom and Solflare May Not Be Showing Your NFT Yet

Phantom and Solflare do not read NFT data directly from the Solana blockchain. Instead, they rely on a third-party indexing service called the **Helius DAS API**, which crawls the chain and builds a searchable database of NFTs. Your NFT is not missing from the blockchain — it is missing from that database.

This is a well-known, common issue affecting all new Solana NFT projects. When a collection is newly created or updated, Helius can take anywhere from a few hours to several days to re-index it. This is entirely outside our control.

**This is not a sign anything is wrong.** The NFT exists on-chain, is verified, and is fully usable in the OASIS ecosystem right now. Phantom and Solflare simply have not caught up yet.

We are actively engaging with **Helius, Phantom, and Solflare** directly to request prioritised re-indexing of the OASIS Founders Collection. We are also exploring listing on Magic Eden and Tensor, as marketplace listings are known to trigger immediate indexer pickup.

---

## The RugCheck Score — Understanding the Flags

RugCheck is a tool designed primarily to detect fraudulent **meme coins and fungible tokens**, where a live Mint Authority means the creator can print unlimited supply and dump on holders. It applies the same logic to NFTs, which creates several false positives.

### Mint Authority enabled — FALSE POSITIVE

RugCheck flags this because on a meme coin it would allow minting unlimited tokens. For a Metaplex NFT it is a false positive. When Metaplex creates the Master Edition (which enforces supply = 1), it transfers the Mint Authority to a Program Derived Address (PDA) controlled entirely by the Metaplex program — not any wallet. Nobody can mint more of this token. This is the same state as every major Solana NFT collection including DeGods, Mad Lads, and Okay Bears.

### Freeze Authority enabled — FALSE POSITIVE

Same root cause as above. The Freeze Authority is also held by the Metaplex Master Edition PDA, not by any human-controlled wallet. No one can freeze your token account. This flag applies to every standard Metaplex NFT on Solana.

### Mutable metadata — FIXED

This flag would be legitimate if metadata could still be changed. We have set `isMutable = false` on all OASIS Founders NFTs — the metadata is permanently frozen on-chain and can never be altered by anyone, including us.

---

We have reported these false positives to RugCheck. The Mint and Freeze Authority flags are a structural characteristic of all Metaplex NFTs — fixing them is not possible without destroying the NFT standard itself. We are continuing to engage with RugCheck to ensure their tool correctly classifies NFTs differently from fungible tokens.

---

## This Is a Real NFT With Real Utility

Your OASIS Founders NFT is a legitimate, on-chain Metaplex Non-Fungible Token on Solana mainnet. It is part of a **verified, sized collection** — the collection NFT is itself verified on-chain, and each Founders NFT is cryptographically linked to it.

Beyond being an NFT, it carries genuine utility within the **OASIS Web4 ecosystem**. Your NFT is linked to your OASIS avatar, unlocking Founders-tier access, governance rights, and features within the OASIS Platform as they become available. This utility lives in the OASIS Portal and does not depend on Phantom or Solflare.

---

## We Are Continuing to Work on Every Front

We are actively in contact with or pursuing contact with all of the following:

Phantom · Solflare · Helius · RugCheck · Magic Eden · Tensor · Jupiter · CoinGecko · Bluprynt · Solana Foundation · Independent Verifiers

We will update this page as the situation progresses. If you have any questions in the meantime, please reach out via the OASIS Discord or the contact details on the founders page.
