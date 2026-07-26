# OASISNFTStore — White-Label NFT Campaign Platform

> Cross-chain NFT campaign platform: OpenSea + Pannax + OASIS Web6. Anyone creates a fundraise/NFT campaign in minutes using AI.

---

## Vision

OASISNFTStore is a **white-label, multi-tenant NFT campaign platform** built on the OASIS Web4/Web6 infrastructure. It lets any creator, brand, or project spin up a fully branded NFT campaign page — with custom tiers, perks, metadata, and imagery — using an AI wizard powered by the OASIS Web6 npm package. The existing OASIS Founders campaign becomes the first live template and proof of concept.

---

## Repository

**New repo:** `OASISNFTStore` (separate from NFTFoundersLandingPage)
- Reuses all payment infrastructure from the Founders site verbatim (Stripe, SOL, ETH/USDT, BTC)
- Reuses `api/oasis.js` mint logic as the core engine
- Reuses all CSS design tokens, fonts (Orbitron/Rajdhani/Share Tech Mono), and the star-canvas aesthetic
- Adds the OASIS Web4 Data API as the CMS backend for all persistent campaign data
- Adds the OASIS Web6 npm package for AI campaign generation

> **Note:** The current NFTFoundersLandingPage uses raw `fetch()` calls to the OASIS REST API — it does NOT use an npm package. OASISNFTStore will be the first project to adopt the Web4/Web6 npm packages properly. Confirm package names with the OASIS team before Phase 1 (likely `@oasis-omniverse/web4` and `@oasis-omniverse/web6` or similar).

---

## Core Concepts

| Concept | Description |
|---|---|
| **Campaign** | A single NFT drop — has tiers, branding, pricing, supply limits, perks. Stored as an OASIS holon. |
| **Tier** | A named level within a campaign (e.g. Genesis / Core / Supporter) — maps to a mintable NFT. Stored as a child holon. |
| **Creator** | The person/project running the campaign — they ARE an OASIS avatar. |
| **Template** | A pre-built visual theme for a campaign page; creators pick one and customise. |
| **Platform Admin** | OASIS-side superadmin that can see/manage all campaigns and creators. |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (same as Founders) — no framework, Vercel-hosted |
| API | Vercel Serverless Functions (Node.js ESM) |
| **CMS / Persistent Data** | **OASIS Web4 Data API** via `@oasisomniverse/web4-api` npm package |
| **AI Generation** | **OASIS Web6** via `@oasisomniverse/web6-api` npm package (same pattern) |
| Transactional / Real-time | Redis (Upstash) — mint counts, locks, orders, waitlists, sessions |
| Payments | Stripe + Solana (Phantom) + EVM USDT (ETH/BNB/MATIC) + BTC |
| Minting | OASIS Web4 API (`/api/nft/mint-nft`) — same as Founders |
| Email | Resend |
| Auth (Creators) | Creators = OASIS avatars; session tokens in Redis (TTL 30d) |
| Auth (Admin) | Password-based (same as current admin.html) |

---

## Data Layer Split: OASIS Web4 vs Redis

This is the most important architectural decision. Each layer does what it's best at.

### OASIS Web4 Data API — Persistent CMS Data

Everything that describes "what a campaign IS" lives in OASIS as holons. This makes campaigns first-class citizens in the OASIS ecosystem — discoverable, ownable, composable with other OASIS data.

| Data | OASIS Holon Type | Notes |
|---|---|---|
| Campaign config (branding, settings, socials) | `Campaign` holon | Parent holon — owned by creator's avatar |
| Tier configs (name, price, supply, perks, metadata) | `CampaignTier` child holons | Child holons of the campaign |
| Creator profile | **Avatar** (existing OASIS concept) | Creators register as avatars — same as buyers already do |
| Templates | `Template` holons (or static JSON files) | Rarely changes — could be seeded once and cached |
| Campaign status / approval state | Field on `Campaign` holon | `draft`, `pending_review`, `approved`, `published`, `rejected`, `suspended` |
| Campaign catalog index | OASIS holon query | List all published campaigns via OASIS Data API |
| Completed order records (archive) | `Order` child holon | Long-term receipt, linked to buyer avatar and campaign |

### Redis — Transactional / Real-time Data

Everything that needs speed, TTLs, or atomic operations stays in Redis. This maps directly to what the current Founders site already uses Redis for.

| Data | Redis Key | Why Redis |
|---|---|---|
| Mint counts per tier | `campaign:{id}:mint_count:{tier}` | Atomic `INCR` — prevents overselling |
| Price locks | `campaign:{id}:lock:{orderId}` | TTL-based lock (5 min) — prevents double-pay |
| Order state (live) | `campaign:{id}:order:{orderId}` | State machine: pending→paid→minting→minted, fast tx verify |
| Waitlist emails | `campaign:{id}:waitlist:emails` | O(1) `SISMEMBER` called on every mint for earlybird check |
| Per-email price overrides | `campaign:{id}:waitlist:meta:{email}` | Fast lookup at order creation |
| Creator session tokens | `creator:token:{token}` | TTL 30d, fast auth on every API call |
| OASIS activation keys | `avatar-activation:{key}` | TTL 30d, same pattern as Founders |
| Rate limiting | `ratelimit:{ip}` | Native Redis sliding window |
| Slug → campaign ID lookup | `slug:{slug}` | Fast O(1) lookup for campaign page loads |

### Key Insight: Existing Founders Redis Data

The existing Redis keys for the Founders campaign (`mint_count:genesis` etc.) continue to work as-is. When we migrate to OASISNFTStore, those keys become `campaign:oasis-founders:mint_count:genesis`. The campaign config (tiers, branding, copy) moves to OASIS as a holon. The real-time counters and orders stay in Redis.

---

## Campaign Approval Workflow

Campaigns are never auto-published. They go through a review gate before appearing on the marketplace. This mirrors how other platforms (OpenSea collection approvals, App Store review, etc.) prevent spam and scams.

```
DRAFT ──► PENDING_REVIEW ──► APPROVED ──► PUBLISHED
                │                             │
                ▼                             ▼
           REJECTED ──► (creator edits) ──► PENDING_REVIEW (resubmit)
                                              
PUBLISHED ──► SUSPENDED  (admin can suspend at any time)
```

| Status | Meaning |
|---|---|
| `draft` | Creator working on it — only visible to creator in their dashboard |
| `pending_review` | Creator clicked "Submit for Review" — admin sees it in approval queue |
| `approved` | Admin approved — creator can now toggle "Publish" to go live |
| `published` | Live on marketplace — buyers can find and mint |
| `rejected` | Admin rejected with a reason — creator notified by email |
| `suspended` | Admin took it down post-publish — removed from marketplace, minting disabled |

**Admin campaign queue** (`/admin/campaigns`) shows all `pending_review` campaigns at the top with Approve / Reject buttons and a notes field for rejection reason. Rejection sends an automatic email to the creator (via Resend) with the reason and a link back to their editor.

---

## Campaign URL Structure

All campaigns live under path routing — no subdomains needed:

```
oasisnftstore.io/campaign/my-awesome-drop   ← public campaign page
oasisnftstore.io/dashboard                   ← creator portal
oasisnftstore.io/admin                       ← platform admin
oasisnftstore.io/                            ← marketplace
```

This works on Vercel Hobby with zero extra config. A custom domain per campaign (e.g. `nfts.myproject.io` pointing to their campaign) can be added later as a Pro feature using Vercel's custom domain API.

---

## Vercel Function Budget

Vercel Hobby limit is **12 serverless functions**. Carefully planned:

| # | File | Purpose |
|---|---|---|
| 1 | `api/config.js` | Public campaign config GET (reads from OASIS) + platform admin POST |
| 2 | `api/campaigns.js` | Campaign CRUD + approval actions (reads/writes OASIS holons) |
| 3 | `api/generate.js` | AI wizard — calls OASIS Web6 npm, returns campaign config JSON |
| 4 | `api/auth.js` | Creator register/login/me — wraps OASIS avatar API |
| 5 | `api/createPayment.js` | Stripe PaymentIntent (reused verbatim) |
| 6 | `api/create-sol-order.js` | SOL order creation (reused verbatim) |
| 7 | `api/verify-sol-payment.js` | SOL payment verify (reused verbatim) |
| 8 | `api/verify-card-payment.js` | Stripe payment verify (reused verbatim) |
| 9 | `api/oasis.js` | Mint NFT via OASIS (reused verbatim) |
| 10 | `api/orders.js` | Orders list + gift orders (campaign-scoped) |
| 11 | `api/notify.js` | Email + webhooks (reused verbatim) |
| 12 | `api/lock-price.js` | Price lock (reused verbatim) |

> If we need a 13th: consolidate `auth.js` into `campaigns.js` using action params — same pattern as current `config.js` POST actions.

---

## OASIS Web4 Data API Usage

All CMS data goes through `@oasisomniverse/web4-api` (installed from GitHub: `NextGenSoftwareUK/OASIS-API-Javascipt-Package-WEB4`). Already installed and in use in NFTFoundersLandingPage. The key operations for OASISNFTStore:

```js
const { OASISClient } = require('@oasisomniverse/web4-api');
const oasis = new OASISClient({ baseUrl: process.env.OASIS_API_URL_LIVE });
await oasis.auth.login({ username, password }); // stores JWT in tokenStore automatically

// Save/update a campaign holon
await oasis.data.saveHolon({ /* campaign JSON — arbitrary fields accepted */ });

// Load a campaign by ID
const res = await oasis.data.loadHolon({ holonId: campaignId });
const campaign = res.result; // SDK unwraps double-nested envelope, normalises key casing

// List all holons (marketplace — filter client-side or pass server filter params)
const list = await oasis.data.loadAllHolons({ /* filter params */ });

// Load child holons (tiers under a campaign)
const tiers = await oasis.data.loadHolonsForParent({ parentId: campaignId });

// Delete a campaign (admin only)
await oasis.data.deleteHolon({ holonId: campaignId });
```

Auth is managed the same way as in NFTFoundersLandingPage's `api/oasis.js` — a module-level `OASISClient` singleton, re-authenticated when `oasis.auth.isAuthenticated()` returns false. Creators log in as their own avatar via `oasis.auth.login()`, which then gates their campaign CRUD.

---

## OASIS Web6 npm — AI Campaign Generator

The AI wizard calls the OASIS Web6 npm package. A creator writes a plain-English prompt; Web6 returns a complete campaign config JSON ready to save.

### User Flow

```
1. Creator visits /create
2. Enters: project name + free-text description
   e.g. "A Web3 gaming guild called DragonForge — 3 tiers: 
        Bronze 50 supply $50, Silver 20 supply $200, Gold 5 supply $1000.
        Perks: Bronze = Discord access; Silver = governance + revenue share;
        Gold = co-founder rights + 1:1 calls"
3. Clicks "Generate Campaign"
4. /api/generate calls Web6:
       const result = await web6.AI.GenerateNFTCampaign({ prompt, schema: CAMPAIGN_CONFIG_SCHEMA });
5. Returns populated campaign config JSON
6. Creator sees a live preview rendered using their chosen template
7. They tweak any field in the CMS editor
8. Upload images (or use Web6 image prompt suggestions with any AI image tool)
9. Submit for review — status becomes "pending_review"
```

### What the AI Generates

Per-campaign:
- Project name, tagline, description
- Suggested colour scheme (primary/accent/background)
- Social link placeholders

Per-tier:
- Tier name, symbol, description
- Suggested USD price and supply limit
- Perk list (bullet points)
- NFT metadata attributes
- Image generation prompt (for Midjourney/DALL-E/Stable Diffusion)

---

## Creator Auth — Creators Are OASIS Avatars

Creators register and log in through the same OASIS avatar system that buyers already use. This means creators are already in the OASIS ecosystem from day one.

```
Register:  POST /api/auth { action:"register", email, username, password }
           → calls OASIS /api/Avatar/register (same as buyer registration in oasis.js)
           → stores session token in Redis with TTL 30d
           → returns { token, avatarId, username }

Login:     POST /api/auth { action:"login", username, password }
           → calls OASIS /api/avatar/authenticate
           → stores new session token in Redis
           → returns { token, avatarId, username }

Session:   GET /api/auth  [Authorization: Bearer {token}]
           → looks up token in Redis → gets avatarId
           → loads avatar from OASIS
           → returns creator profile

Logout:    POST /api/auth { action:"logout", token }
           → deletes Redis session key
```

No bcrypt or JWT signing library needed — OASIS handles the credential storage; we only store a random session token in Redis.

---

## Campaign Config JSON Shape

The shape stored as an OASIS holon. Drives the entire campaign page render:

```json
{
  "id": "abc123",
  "holonType": "Campaign",
  "slug": "my-awesome-drop",
  "creatorAvatarId": "avatar-456",
  "status": "draft",
  "template": "founders",
  "branding": {
    "projectName": "My Awesome Drop",
    "tagline": "Join the future of X",
    "description": "Long markdown description...",
    "logoUrl": "https://...",
    "bannerUrl": "https://...",
    "primaryColor": "#00e5ff",
    "accentColor": "#f0a500",
    "font": "orbitron"
  },
  "socials": {
    "twitter": "@handle",
    "discord": "https://discord.gg/...",
    "website": "https://..."
  },
  "tiers": [
    {
      "id": "tier-genesis",
      "holonType": "CampaignTier",
      "name": "Genesis",
      "symbol": "GEN",
      "priceUSD": 500,
      "supply": 20,
      "color": "#f0a500",
      "gradient": "linear-gradient(135deg,#1a0e00,#0a1535)",
      "imageUrl": "https://...",
      "description": "Founding member tier with maximum benefits",
      "perks": [
        "Lifetime platform access",
        "Governance voting rights",
        "Revenue share 5%"
      ],
      "metadata": {
        "attributes": [
          { "trait_type": "Tier", "value": "Genesis" },
          { "trait_type": "Access", "value": "Founding Member" }
        ]
      }
    }
  ],
  "settings": {
    "allowWaitlist": true,
    "earlyBirdEnabled": true,
    "giftEnabled": true,
    "chains": ["SOL", "ETH", "BNB", "MATIC", "BTC", "STRIPE"],
    "mintOpen": true,
    "royaltyBps": 500
  },
  "approval": {
    "submittedAt": null,
    "reviewedAt": null,
    "reviewedByAvatarId": null,
    "rejectionReason": null
  },
  "legal": {
    "termsUrl": null,
    "privacyUrl": null
  },
  "publishedAt": null,
  "createdAt": "2026-07-26T00:00:00Z"
}
```

---

## Redis Key Schema (Transactional Data Only)

No CMS data in Redis. Only the real-time, transactional, and session data:

```
# Session / auth
creator:token:{token}               STRING → avatarId  (TTL 30d)
avatar-activation:{key}             JSON { email, avatarId, ... }  (TTL 30d)

# Campaign runtime
slug:{slug}                         STRING → campaignId  (O(1) slug lookup, mirrored from OASIS)
campaign:{id}:mint_count:{tier}     INT (atomic INCR — never in OASIS)
campaign:{id}:lock:{orderId}        STRING (TTL 5min price lock)
campaign:{id}:order:{orderId}       JSON { orderId, status, tier, amount, ... }
campaign:{id}:waitlist:emails       SET of email addresses
campaign:{id}:waitlist:meta:{email} JSON { tierOverrides: { genesis: 100, ... } }

# Rate limiting
ratelimit:{ip}:{endpoint}           INT (sliding window counter, TTL 60s)

# Test/archived namespace (inherited from Founders)
test:campaign:{id}:...              same shape, TEST_MODE=true prefix
archived:campaign:{id}:...          read-only snapshot
```

---

## Frontend Pages

| # | URL | File | Description |
|---|---|---|---|
| 1 | `/` | `index.html` | Marketplace — browse all published campaigns |
| 2 | `/create` | `create.html` | AI campaign wizard (Web6 prompt → live preview) |
| 3 | `/templates` | `templates.html` | Browse pre-built templates with previews |
| 4 | `/campaign/[slug]` | `campaign.html` | Dynamic campaign page — loads OASIS holon, renders template |
| 5 | `/dashboard` | `dashboard.html` | Creator dashboard — my campaigns + status + quick stats |
| 6 | `/dashboard/edit` | `dashboard-edit.html` | CMS editor — branding, tiers, settings + live preview panel |
| 7 | `/dashboard/orders` | `dashboard-orders.html` | Creator-scoped order view + CSV export |
| 8 | `/dashboard/analytics` | `dashboard-analytics.html` | Per-campaign charts: mints, revenue, waitlist |
| 9 | `/admin` | `admin.html` | Platform superadmin home — stats + system health |
| 10 | `/admin/campaigns` | `admin-campaigns.html` | All campaigns + approval queue + approve/reject/suspend |
| 11 | `/admin/creators` | `admin-creators.html` | All creators + suspend + pricing overrides |
| 12 | `/admin/analytics` | `admin-analytics.html` | Platform-wide revenue/mint charts |

---

## Templates

Creators pick a template when starting a campaign. Colours, copy, and images are then customised via the CMS editor. The template only controls the HTML/CSS structure.

### Template 1 — OASIS Founders *(exact clone of current Founders site)*
- Dark space theme: `--bg-deep:#030714`, star canvas, cyan glow animations
- Orbitron/Rajdhani/Share Tech Mono fonts
- 3-tier card layout (gold/blue/green per tier)
- Animated hero, Learn banner, scroll-to-mint flow
- This IS the current Founders page — just parameterised from the campaign config

### Template 2 — Clean Minimal
- White/light background, OpenSea-inspired card grid
- Clean sans-serif (Inter), generous white space
- NFT image front-and-centre per tier

### Template 3 — Dark Luxury
- Near-black background, gold accents
- Premium serif headings (Playfair Display)
- Oversized hero imagery — suitable for high-value art drops

### Template 4 — Gaming Guild
- Purple/neon green palette, XP/level language
- Guild tier naming (Bronze/Silver/Gold/Diamond)
- Animated border effects

### Template 5 — DeFi Protocol
- Dark blue/electric blue, data-dashboard aesthetic
- Numeric stats (TVL, APY, token supply) prominently displayed
- Protocol tokenomics language

### Template 6 — Art Collection
- Gallery-style white/cream, large image-first layout
- Artist profile section, exhibition-inspired typography

---

## Dynamic Campaign Page

`campaign.html` loads a campaign from OASIS and renders the correct template client-side:

```js
// 1. Get slug from URL path
const slug = location.pathname.split('/campaign/')[1];

// 2. Load campaign config from OASIS (via our API which reads the holon)
const config = await fetch(`/api/config?slug=${slug}`).then(r => r.json());

// 3. Apply brand CSS variables
document.documentElement.style.setProperty('--primary', config.branding.primaryColor);
// ...

// 4. Load and run the template renderer
const template = await import(`/templates/${config.template}/render.js`);
template.render(config);

// 5. Payment/mint flow is identical to Founders — same API calls, same modal
```

Each template's `render.js` takes the config JSON and writes the DOM. The Founders template's `render.js` is the current `index.html` logic extracted and parameterised.

---

## Marketplace (`/`)

- Hero: "Launch your NFT campaign with AI — powered by OASIS Web6"
- CTAs: "Create Campaign" + "Browse Templates"
- **Approval queue banner** (admin only, when logged in): "X campaigns awaiting review"
- **Featured Campaigns** — admin-curated grid at top
- **All Campaigns** — paginated grid from OASIS holon query
- Filter: chain accepted, template, status (minting now / sold out / upcoming)
- Each card: campaign image, name, creator, tier count, price range, mint progress bar

---

## Admin Features

### `/admin` — Home
- Total campaigns (by status), creators, mints, revenue across all campaigns
- **Approval queue** — campaigns with `pending_review` status (primary admin task)
- Recent activity: new signups, new submissions, recent mints
- System health: Redis ping, OASIS API status, Web6 API status

### `/admin/campaigns` — Campaign Management
- Table: all campaigns with status badge, creator, template, created date
- **Approval queue** tab — pending campaigns with Approve / Reject buttons + notes field
- Rejection sends automatic email to creator with reason
- Approved campaigns creator can then toggle publish from their dashboard
- Search/filter by status, creator, template
- Actions: view live, view orders, suspend/unsuspend, delete

### `/admin/creators` — Creator Management
- Table: all creators (avatarId, email, campaign count, total revenue, joined date)
- Actions: view campaigns, suspend account, set pricing overrides (same as current admin waitlist overrides)

### `/admin/analytics` — Platform Analytics
- Revenue by day/week/month, per chain breakdown
- Mint volume chart
- Campaign leaderboard (top campaigns by revenue/volume)
- Creator leaderboard

---

## Phase Plan

### Phase 1 — Core Infrastructure (Week 1–2)
- [ ] Create `OASISNFTStore` repo, copy Founders site as starting point
- [ ] Install OASIS Web4 npm package — confirm package name with OASIS team
- [ ] Implement OASIS Web4 Data API wrapper (`lib/oasisData.js`) for campaign holons CRUD
- [ ] Redis schema for transactional data only (mint counts, locks, orders, waitlists, sessions)
- [ ] `api/campaigns.js` — campaign CRUD via OASIS Web4
- [ ] `api/auth.js` — creator register/login/me via OASIS avatar API
- [ ] `api/config.js` — serve campaign config by slug (reads OASIS + Redis mint counts)
- [ ] Slug → campaignId lookup cached in Redis (mirrored from OASIS on save)
- [ ] Seed the Founders campaign as a live OASIS holon (slug: `oasis-founders`)
- [ ] Existing payment APIs copied and updated for `campaign:{id}:*` Redis keys

### Phase 2 — Founders Template (Week 2–3)
- [ ] Extract current `index.html` into `templates/founders/render.js`
- [ ] Parameterise all hardcoded values to read from campaign config
- [ ] `campaign.html` — dynamic campaign page shell
- [ ] Verify Founders campaign renders pixel-perfect via the template system
- [ ] `templates.html` — template gallery with screenshot previews

### Phase 3 — AI Generator (Week 3–4)
- [ ] Install OASIS Web6 npm package — confirm package name with OASIS team
- [ ] `api/generate.js` — Web6 AI call, returns campaign config JSON
- [ ] `create.html` — AI wizard UI: prompt input → loading → live preview
- [ ] Tier image prompt suggestions displayed in CMS editor
- [ ] Save as `draft` — creator directed to dashboard editor

### Phase 4 — Creator Dashboard (Week 4–5)
- [ ] `dashboard.html` — campaign list, status badges, mint progress, quick stats
- [ ] `dashboard-edit.html` — tabbed CMS editor with live preview panel (iframe)
- [ ] Submit for Review button → updates holon status to `pending_review`
- [ ] `dashboard-orders.html` — creator-scoped orders (read Redis for campaign)
- [ ] `dashboard-analytics.html` — per-campaign charts (inline Chart.js, no CDN)

### Phase 5 — Marketplace (Week 5–6)
- [ ] `index.html` — campaign discovery grid (queries OASIS for published campaigns)
- [ ] Campaign card component (shared HTML/JS across pages)
- [ ] Featured campaigns (admin-curated field on holon)
- [ ] Filter/sort controls

### Phase 6 — Platform Admin (Week 6–7)
- [ ] `admin.html` — platform home with approval queue
- [ ] `admin-campaigns.html` — approval workflow, approve/reject with email notification
- [ ] `admin-creators.html` — creator management + pricing overrides
- [ ] `admin-analytics.html` — platform-wide charts

### Phase 7 — Additional Templates (Week 7–8)
- [ ] Template 2: Clean Minimal
- [ ] Template 3: Dark Luxury
- [ ] Template 4: Gaming Guild
- [ ] Template 5: DeFi Protocol
- [ ] Template 6: Art Collection

### Phase 8 — Advanced Features (Week 8+)
- [ ] Platform fee system (revenue share taken at order creation)
- [ ] Royalties config in campaign settings (passed to OASIS mint payload)
- [ ] Custom domain per campaign (Vercel domain API — Pro feature)
- [ ] Embed widget (iframe snippet for external sites)
- [ ] Webhook system (creators get POST on each sale)
- [ ] Bulk CSV import for waitlists
- [ ] Secondary market / resale listing (OASIS marketplace feed)
- [ ] DAO governance hooks (Pannax-style — snapshot.org or OASIS native voting)

---

## Environment Variables

```env
# New for OASISNFTStore
PLATFORM_ADMIN_PASSWORD=...          # superadmin password (same pattern as Founders)
OASIS_WEB4_PACKAGE_URL=...           # confirm with OASIS team
OASIS_WEB6_PACKAGE_URL=...           # confirm with OASIS team
PLATFORM_FEE_PERCENT=0               # 0 = free for now

# Existing — unchanged from Founders
REDIS_URL=...
TEST_MODE=false
STRIPE_PK_LIVE=...
STRIPE_SK_LIVE=...
STRIPE_PK_TEST=...
STRIPE_SK_TEST=...
OASIS_API_URL_LIVE=...
OASIS_API_URL_TEST=...
OASIS_AVATAR_USERNAME_LIVE=...
OASIS_AVATAR_PASSWORD_LIVE=...
OASIS_AVATAR_ID_LIVE=...
EVM_RECEIVER=...
BTC_ADDR=...
TREASURY_WALLET_SOL=...
RESEND_API_KEY=...
EMAIL_FROM=...
COLLECTION_PUBLIC_KEY_MAINNET=...
COLLECTION_PUBLIC_KEY_TEST=...
USDT_ETH_LIVE=...
USDT_BNB_LIVE=...
USDT_MATIC_LIVE=...
```

---

## Reuse Inventory from NFTFoundersLandingPage

| Asset | Decision |
|---|---|
| `api/oasis.js` | Copy verbatim — mint engine for all campaigns |
| `api/createPayment.js` | Copy verbatim |
| `api/create-sol-order.js` | Copy verbatim — add `campaignId` to order body |
| `api/verify-sol-payment.js` | Copy verbatim |
| `api/verify-card-payment.js` | Copy verbatim |
| `api/lock-price.js` | Copy verbatim |
| `api/notify.js` | Copy verbatim |
| `lib/solPrice.js` | Copy verbatim |
| `lib/rateLimit.js` | Copy verbatim |
| `lib/verifySolTx.js` | Copy verbatim |
| `img/nft-*.png` | Founders template defaults; creators upload their own |
| `metadata/*.json` | Founders template defaults |
| All CSS design tokens + star canvas | Become the Founders template defaults |
| Payment modal HTML/JS | Extracted to `components/payment-modal.js` (shared) |
| Admin auth pattern (password → Redis check) | Inherited for platform superadmin |
| Redis test/archived namespace system | Inherited unchanged for transactional data |
| `scripts/*.mjs` | Copy and extend for multi-campaign support |

---

## Key Design Decisions

1. **OASIS Web4 for CMS** — campaigns, tiers, creators are OASIS holons/avatars. This integrates the platform natively into the OASIS ecosystem rather than duplicating data.
2. **Redis for transactions only** — mint counts, locks, orders, waitlists, sessions. Redis is the right tool for these; OASIS holons are not designed for atomic counters or TTL locks.
3. **Creators = OASIS avatars** — same registration flow as buyers. Creators are already in the OASIS ecosystem from signup.
4. **Approval gate** — all campaigns start as drafts, require admin approval before publishing. Prevents spam and scams on the marketplace.
5. **Path routing** — all campaigns at `/campaign/{slug}`. Works on Vercel Hobby. Custom domains (e.g. `nfts.myproject.io`) added later as Pro feature.
6. **No framework** — same fast-loading vanilla approach that makes Founders work on Vercel Hobby without a build step.
7. **Template = JS module** — each template is a `render.js` that takes config JSON and writes the DOM. No build step needed.
8. **Founders = first campaign** — seeded as an OASIS holon on first deploy. The Founders URL redirects to `/campaign/oasis-founders`. Proves backward compat.
9. **Payment APIs are campaign-agnostic** — add `campaignId` to order body; all Redis keys become `campaign:{id}:*`. Minimal code change.

---

## Open Questions

1. **Web4 package name confirmed**: `@oasisomniverse/web4-api`, installed from `github:NextGenSoftwareUK/OASIS-API-Javascipt-Package-WEB4`. Auth, avatar, NFT and data modules all available. Already live in NFTFoundersLandingPage.
2. **Web6 package name**: assumed `@oasisomniverse/web6-api` from same GitHub org — confirm before Phase 3.
3. **OASIS holon schema**: the `data.saveHolon` and `data.loadAllHolons` endpoints accept arbitrary JSON. Confirm what filter/query params `loadAllHolons` supports for filtering by status/type server-side vs. client-side.
4. **Image hosting** — OASIS image CDN vs Vercel Blob for creator-uploaded images? Recommend OASIS CDN to keep everything in the OASIS ecosystem.
5. **Pannax-style features** — DAO governance hooks (proposal voting, community treasury) — Phase 8 or later?
6. **Platform fee** — free to create for launch, or charge a small creation/listing fee from day one?
