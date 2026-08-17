# Wallet & Collection Update Checklist

Use this checklist any time the treasury, mint, or test wallets need to be replaced (e.g. compromised seed phrase).

---

## 1. Vercel Environment Variables
*Settings → Environment Variables — update for Production AND Preview*

| Variable | Description |
|---|---|
| `COLLECTION_PUBLIC_KEY_LIVE` | New **mainnet** collection mint address |
| `COLLECTION_PUBLIC_KEY_TEST` | New **devnet** collection mint address |
| `TREASURY_WALLET_SOL` | New **treasury wallet** public key |
| `OASIS_AVATAR_USERNAME_LIVE` | Mint wallet OASIS avatar username (live) |
| `OASIS_AVATAR_PASSWORD_LIVE` | Mint wallet OASIS avatar password (live) |
| `OASIS_AVATAR_ID_LIVE` | Mint wallet OASIS avatar ID (live) |
| `OASIS_AVATAR_USERNAME_TEST` | Mint wallet OASIS avatar username (test) |
| `OASIS_AVATAR_PASSWORD_TEST` | Mint wallet OASIS avatar password (test) |
| `OASIS_AVATAR_ID_TEST` | Mint wallet OASIS avatar ID (test) |

> **Note:** OASIS avatars for the mint wallet do NOT need to be recreated unless the avatar credentials themselves are compromised — only the Solana wallet/collection changes.

---

## 2. Codebase — Hardcoded Fallbacks

Update these files in the repo (these are fallbacks if env vars are missing):

- [ ] [`api/oasis.js:197-198`](../api/oasis.js) — hardcoded fallback collection public keys (test + live)
- [ ] [`docs/collection-setup.md:106-107`](collection-setup.md) — update documented collection addresses
- [ ] [`docs/OASISNFTStore-plan.md:603-605`](OASISNFTStore-plan.md) — update example env vars

---

## 3. Collections to Create

- [ ] **Devnet** — create new collection NFT on devnet with new test wallet → copy mint address → set `COLLECTION_PUBLIC_KEY_TEST`
- [ ] **Mainnet** — create new collection NFT on mainnet with new mint wallet → copy mint address → set `COLLECTION_PUBLIC_KEY_LIVE`

See [`docs/collection-setup.md`](collection-setup.md) for full instructions on creating a collection.

---

## 4. Marketplaces

- [ ] **Magic Eden** — contact support to withdraw old submission, resubmit with new collection address
- [ ] **Tensor** — contact support to withdraw old submission, resubmit with new collection address

---

## 5. OASIS DNA (Railway `OASIS_DNA_JSON` env var)

Update in both Railway services (dev and live):

- [ ] **Dev Railway service** — update `OASIS_DNA_JSON` with new mint wallet Solana address/credentials if stored there
- [ ] **Live Railway service** — update `OASIS_DNA_JSON` with new mint wallet Solana address/credentials if stored there

> Check the `OASIS_DNA_JSON` env var content for any fields referencing the old wallet address and update accordingly.

---

## 6. Helius

- [ ] Re-index the new collection once created — request a manual DAS re-index via Helius support (use the **official** support channel, not anyone who DMs you or posts links in response to your question!)
- [ ] Update any Helius webhooks that reference the old collection address

---

## 7. After Everything is Updated

- [ ] Test a mint on **devnet** end to end
- [ ] Test a mint on **mainnet** (small amount)
- [ ] Verify collection shows correctly in Phantom
- [ ] Verify collection shows on Magic Eden / Tensor after resubmission approval

---

## Security Reminder

**No legitimate service will ever ask for your seed phrase / recovery words.** Not Phantom, not Helius, not Magic Eden, not anyone. Ever. If any support ticket, bot, or website asks for recovery words — it is a scam.

- Only trust verified team members with official role badges in Discord
- Never click support links posted in public channels — always use the pinned/official link
- When in doubt, DM a mod directly
