# NFT Founders Landing Page — Dev Environment Setup

**Date:** 2026-07-29  
**Branch:** `dev`  
**Live site:** https://founders.oasisomniverse.one (main branch)  
**Dev site:** https://dev.founders.oasisomniverse.one (dev branch, this setup)  

---

## Why we built a separate dev environment

The goal was to test the full flow (payment → NFT mint → activation email → portal login → NFT display)
without touching live production data.

**The blocker on Vercel Hobby plan:**  
Preview deployments (branch deployments) are SSO-protected. Only "production" deployments are
publicly accessible. You can't test Stripe, activation emails, or Phantom wallet flows through
an SSO-gated preview — the flow breaks because third parties can't hit your APIs.

**The solution:**  
Create a second, completely separate Vercel project (`nft-founders-landing-page-dev`) and deploy
the `dev` branch as its *production* deployment. This makes it publicly accessible with no SSO.

> **If you upgrade to Pro:** You can disable SSO on preview deployments per-project via
> Project Settings → Deployment Protection → disable "Vercel Authentication". Then you don't
> need a separate project at all — just point `dev.founders.oasisomniverse.one` at the branch
> preview and you're done. The GitHub Action and `nft-founders-landing-page-dev` project become
> redundant.

---

## What was created

### 1. Vercel Project: `nft-founders-landing-page-dev`

- **Team:** OASIS Team (`team_Cbpz3S0ZTjS1fCjsyBnmbJFh`)
- **Project ID:** `prj_FYGQhopNDqVTqBXFEL2vrPlivj04`
- **Domain:** `dev.founders.oasisomniverse.one` → points at this project's production deployment
- **Source branch:** `dev` (deployed as production via GitHub Action below)
- Completely separate from `nft-founders-landing-page` (the live project on `main`)

### 2. GitHub Action: `.github/workflows/deploy-dev.yml`

Triggers on every push to `dev`, runs `vercel --prod` targeting the dev project.

```yaml
name: Deploy dev branch to production (nft-founders-landing-page-dev)
on:
  push:
    branches:
      - dev
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel Production
        run: npx vercel --prod --yes --scope=oasis-team
```

**GitHub Secrets required** (in the NFTFoundersLandingPage repo, under Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `VERCEL_TOKEN` | Personal Vercel token (must be scoped to OASIS Team) |
| `VERCEL_ORG_ID` | `team_Cbpz3S0ZTjS1fCjsyBnmbJFh` |
| `VERCEL_PROJECT_ID` | `prj_FYGQhopNDqVTqBXFEL2vrPlivj04` (the dev project, NOT the live one) |

> **If you upgrade to Pro:** The GitHub Action is only needed because of the separate-project
> workaround. On Pro you can delete deploy-dev.yml and let Vercel auto-deploy branch previews.

---

## Environment Variables (dev project)

These must be set in the `nft-founders-landing-page-dev` Vercel project
(Vercel Dashboard → nft-founders-landing-page-dev → Settings → Environment Variables).

All should be set to **Production** environment (that's what the GitHub Action deploys to).

| Variable | Purpose | Dev value |
|----------|---------|-----------|
| `TEST_MODE` | Activates test mode (Redis prefix, dev API URLs, test Stripe keys) | `true` |
| `REDIS_URL` | Upstash Redis connection string | same as live or separate |
| `STRIPE_SECRET_KEY_TEST` | Stripe **secret** key from test mode | `sk_test_...` |
| `STRIPE_PK_TEST` | Stripe **publishable** key from test mode | `pk_test_...` |
| `RESEND_API_KEY` | Resend email API key | same key works for both |
| `EMAIL_FROM` | From address for activation emails | `noreply@oasisomniverse.one` |
| `OASIS_AVATAR_USERNAME_TEST` | Wizard avatar username for dev API auth | dev wizard username |
| `OASIS_AVATAR_PASSWORD_TEST` | Wizard avatar password for dev API auth | dev wizard password |
| `OASIS_AVATAR_ID_TEST` | Wizard avatar ID for dev API | dev wizard avatar ID |
| `SOLANA_RPC_URL` | Solana RPC endpoint | devnet or mainnet as needed |

> **Important:** `STRIPE_PK_TEST` and `STRIPE_SECRET_KEY_TEST` must be from the **same**
> Stripe account. Mixing keys from different accounts causes "No such payment_intent" errors.

---

## How TEST_MODE works in the code

**`api/oasis.js`**
```js
const TEST_MODE = process.env.TEST_MODE === 'true';
const P = TEST_MODE ? 'test:' : '';  // Redis key prefix
// Activation key stored as: `test:avatar-activation:{key}`
// OASIS API: dev.api.web4.oasisomniverse.one vs api.web4.oasisomniverse.one
```

**`api/sendEmail.js`**
```js
const TEST_MODE = process.env.TEST_MODE === 'true';
// OASIS_API_URL → dev.api.web4.oasisomniverse.one when TEST_MODE
// ACTIVATION_PORTAL_URL → dev.oportal.oasisomniverse.one/activate.html when TEST_MODE
// Wizard credentials → OASIS_AVATAR_USERNAME_TEST / OASIS_AVATAR_PASSWORD_TEST when TEST_MODE
```

**`api/config.js`**
```js
// Returns testMode: true to frontend
// Returns stripePk: STRIPE_PK_TEST when TEST_MODE (frontend uses this for Stripe.js)
```

**`api/createPayment.js` / `api/verify-card-payment.js`**
```js
// testMode comes from req.body (set by frontend from /api/config response)
// Selects STRIPE_SECRET_KEY_TEST vs STRIPE_SECRET_KEY_LIVE accordingly
```

---

## CORS setup for dev.oportal

`api/sendEmail.js` uses dynamic CORS to allow both the live and dev portals:

```js
const ALLOWED_ORIGINS = new Set([
  "https://oportal.oasisomniverse.one",
  "https://dev.oportal.oasisomniverse.one"
]);
function getCorsHeaders(req) {
  const origin = req.headers.origin || '';
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://oportal.oasisomniverse.one",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
```

---

## OPORTAL-JS dev branch

**File:** `assets/js/config.js` on the `dev` branch

All URLs point at dev APIs:
```js
window.apiUrl = 'https://dev.api.web4.oasisomniverse.one';
window.foundersApiUrl = 'https://dev.founders.oasisomniverse.one';
// etc.
```

The OPORTAL-JS `dev` branch is deployed by Vercel automatically (it has proper branch→domain
mapping in its own project settings, unlike the founders project which needed the workaround).
`dev.oportal.oasisomniverse.one` → OPORTAL-JS `dev` branch.

---

## Email domain

During this session, `oasisomniverse.one` was verified in Resend (resend.com/domains).
Previously emails were sent from `oasisweb4.com`.

**Resend setup:** Verify DNS records at resend.com/domains for `oasisomniverse.one`.
`EMAIL_FROM` should be something like `noreply@oasisomniverse.one`.

---

## Known issues / things to investigate

### NFTs showing as 0 in dev portal

Each test run deletes the avatar first (expected), so each mint creates a fresh avatar and
links the NFT to it. The mint reports `savedCount:1` and the Solana NFT appears in Phantom.
However the portal shows 0 NFTs.

The Solana chain part worked. The question is whether the OASIS web4 database record that
*links* the NFT to the avatar was actually saved, separate from the on-chain mint.
The mint logs show "Failed to create associated token account" errors in `innerMessages` —
these may indicate partial Solana success while the OASIS DB record also failed silently.

**How to diagnose:**
1. Open DevTools on dev.oportal, run: `JSON.parse(localStorage.getItem('avatar'))` and note
   both `id` and `avatarId` (they should match after login hydration)
2. Copy the `jwtToken` from the same object
3. Call directly: `GET https://dev.api.web4.oasisomniverse.one/api/nft/load-all-nfts-for-avatar/{id}`
   with header `Authorization: Bearer {jwtToken}`
4. If empty → the OASIS backend didn't persist the web4 NFT record despite `savedCount:1`
   (backend OASIS API issue, not frontend)
5. If returns data → it's a frontend display/parsing issue in the portal

**The "Failed to create associated token account" errors** in mintNftAsync innerMessages may be
causing the OASIS web4 record save to abort early. Worth checking the OASIS C# NFT provider code
to see if the DB save is gated on the Solana operation fully succeeding.

---

## Upgrade to Pro checklist

When you upgrade Vercel to Pro, you can simplify the dev setup significantly:

- [ ] In `nft-founders-landing-page` project: Settings → Deployment Protection → disable
      "Vercel Authentication" for Preview deployments
- [ ] Add `dev` branch → `dev.founders.oasisomniverse.one` domain mapping in the same project
- [ ] Delete `.github/workflows/deploy-dev.yml` (no longer needed)
- [ ] Delete the `nft-founders-landing-page-dev` Vercel project (no longer needed)
- [ ] Remove the `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` GitHub Secrets (or update to live values)
- [ ] Environment variables can now be set per-branch (not just per-environment) on Pro, 
      so `TEST_MODE=true` can be scoped to the `dev` branch only

Everything else (the code changes in `oasis.js`, `sendEmail.js`, `config.js`, CORS, etc.)
stays exactly the same — that's all environment-driven and branch-agnostic.
