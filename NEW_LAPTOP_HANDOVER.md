# New Laptop Setup Handover
_Last updated: 2026-09-12_

## Relevant Projects on C:\Source\

These are the projects actively in development. Clone all of these fresh on the new machine.

| Local path | GitHub repo | Active branch |
|---|---|---|
| `C:\Source\NFTFoundersLandingPage` | `https://github.com/NextGenSoftwareUK/NFTFoundersLandingPage.git` | `dev` |
| `C:\Source\OASIS2` | `https://github.com/NextGenSoftwareUK/OASIS.git` | `Development` |
| `C:\Source\OASISNFTStore` | (check GitHub) | (check) |
| `C:\Source\OASIS-API-Javascipt-Package-WEB4` | `https://github.com/NextGenSoftwareUK/OASIS-API-Javascipt-Package-WEB4.git` | — |

> Note: `NFTFoundersLandingPage` has a `dev` branch — **always work on dev, never main directly.**

---

## NFTFoundersLandingPage — Setup

```bash
git clone https://github.com/NextGenSoftwareUK/NFTFoundersLandingPage.git
cd NFTFoundersLandingPage
git checkout dev
npm install
```

### Vercel Projects

There are **two** Vercel projects for this repo (you're on Pro now):
- **Live**: `nft-founders-landing-page` — main branch, live domain
- **Dev**: `nft-founders-landing-page-dev` — dev branch, deployed via GitHub Actions

GitHub Actions workflow: `.github/workflows/deploy-dev.yml`  
Has `workflow_dispatch` + hourly `schedule` fallback + push trigger.

### Environment Variables (set in Vercel for both projects)

| Var | Description |
|---|---|
| `REDIS_URL` | Upstash Redis connection URL |
| `TEST_MODE` | `true` for dev project, `false`/unset for live |
| `STRIPE_PK_TEST` | Stripe publishable key (test) |
| `STRIPE_PK_LIVE` | Stripe publishable key (live) |
| `STRIPE_SECRET_KEY_TEST` | Stripe secret key (test) |
| `STRIPE_SECRET_KEY_LIVE` | Stripe secret key (live) |
| `ADMIN_PASSWORD` | Admin panel password |
| `OWNER_NOTIFICATION_EMAIL` | Comma-separated notification emails e.g. `davidellams@hotmail.com,david.ellams@oasisomniverse.one` |
| `MINT_OPEN` | `true` = mint modal enabled; `false`/unset = coming soon/waitlist popup |
| `EVM_RECEIVER` | EVM wallet address for ETH/BNB/MATIC payments |
| `BTC_ADDR` | Bitcoin address |
| `TREASURY_WALLET_SOL` | Solana treasury wallet address |
| `USDT_ETH_TEST` / `USDT_ETH_LIVE` | USDT contract address on Ethereum |
| `USDT_BNB_TEST` / `USDT_BNB_LIVE` | USDT contract address on BNB |
| `USDT_MATIC_TEST` / `USDT_MATIC_LIVE` | USDT contract address on Polygon |
| `OASIS_API_URL_TEST` | Internal OASIS API URL (test) — NOT exposed to clients |
| `OASIS_API_URL_LIVE` | Internal OASIS API URL (live) — NOT exposed to clients |
| `OASIS_IMAGE_URL` | NFT image base URL |
| `EMAIL_FROM` | From address for Resend emails |
| `RESEND_API_KEY` | Resend API key |

### Key API Files

| File | Purpose |
|---|---|
| `api/config.js` | Public GET: returns mintOpen, Stripe PK, SOL/EVM addresses, mint counts. Admin POST: manage waitlist, overrides, orders. |
| `api/oasis.js` | Core mint endpoint — handles SOL payment verification, OASIS NFT mint, order completion, owner notification |
| `api/createPayment.js` | Creates Stripe PaymentIntent, stores pending order in Redis |
| `api/notify.js` | Waitlist signup — saves email to Redis, sends owner notification via Resend |
| `api/gift-order.js` | Handles free/gift mints (price override = 0) |

### Redis Key Namespace

- Dev uses `test:` key prefix (set by `TEST_MODE=true`)
- Live uses no prefix
- Both point to the **same** Upstash Redis instance — prefix keeps them isolated

### npm Scripts

```bash
npm run reset:test      # Reset test namespace counts + orders
npm run reset:live      # Reset live namespace (CAREFUL!)
npm run reset:counts    # Reset mint counts only
npm run reset:dry       # Dry run — shows what would be deleted
```

---

## OASIS2 — C# Backend Setup

```bash
git clone https://github.com/NextGenSoftwareUK/OASIS.git OASIS2
cd OASIS2
git checkout Development
```

Open in Visual Studio: `NextGenSoftware.OASIS.sln` (or whichever the main solution file is).

### MongoDB Connection Pool Fix (deployed 2026-09-12)

**File:** `Providers/Storage/NextGenSoftware.OASIS.API.Providers.MongoOASIS/Repositories/MongoDBContext.cs`

MongoClient is now a static singleton per connection string, capped at 30 connections:
- 14 Railway instances × 30 = 420 connections (under Atlas free tier 500 limit)

**Pending:** Create a separate Atlas cluster for dev, then bump pool size back to 70.

### Railway Deployments

- 14 instances total: 7 live + 7 dev
- Hosted on Railway — check the Railway dashboard for connection string env vars
- After any OASIS2 code change: push to `Development` branch, then redeploy affected Railway instances

### MongoDB Atlas

- Currently: dev and live share **one** free M0 cluster (500 connection limit)
- **TODO:** Create a second free M0 Atlas cluster in a separate project for dev
  - Once done: update 7 dev Railway instances with new connection string
  - Then bump `MaxConnectionPoolSize` from 30 → 70 in `MongoDBContext.cs`
  - Result: 7 × 70 = 490 per cluster, both under 500 limit

---

## Tools to Install on New Laptop

- **Node.js** (LTS) — for NFTFoundersLandingPage
- **npm** — comes with Node
- **Git**
- **Visual Studio** (for OASIS2 C# solution)
- **.NET SDK** — version matching what OASIS2 uses
- **MongoDB Compass** — for direct DB inspection (connect strings from Railway env vars)
- **Postman** — for OASIS API testing (import from `C:\Source\Founder NFT Collection Postman.txt`)
- **Claude Code desktop app** — pick up sessions here
- **Vercel CLI** (optional): `npm i -g vercel`

---

## Pending Tasks (as of 2026-09-12)

1. **Create separate MongoDB Atlas cluster for dev** — free M0 in new Atlas project, update dev Railway connection strings, then bump pool size to 70
2. **Set `OWNER_NOTIFICATION_EMAIL` env var** in both Vercel projects if not already set
3. **Set `MINT_OPEN=true`** in Vercel live project when ready to go live
4. **Early bird campaign** — set $49 supporter price overrides (2-week expiry) for waitlist emails via admin panel
5. **Redeploy all 14 Railway OASIS instances** to pick up MongoDB pool fix
6. **Consider simplifying to 1 Vercel project** — now on Pro, branch previews may replace the separate dev project + GitHub Actions setup
7. **Clean up debug step 9a/9b/9c/9d logs** in `api/oasis.js` once confirmed stable

---

## Key Rules for This Project

- **Always work on `dev` branch** — never commit directly to `main`
- **Always commit AND push immediately** after every change — never stage without pushing
- **Never add `Co-Authored-By` lines** to commits
- **Comment out code, don't delete** — user's preference for reviewing changes
- **Server-side `console.log` is fine** — only client-facing JSON response leaks matter
- **Never expose** in client responses: `_debug` blocks, API URLs, credentials, collection keys

---

## Claude Code Sessions

Previous sessions with full context are saved at:
`C:\Users\David\.claude\projects\C--Source-NFTFoundersLandingPage\`

The memory files there have indexed handovers from all previous sessions. Open a new Claude Code session in `C:\Source\NFTFoundersLandingPage` and it will pick up automatically.
