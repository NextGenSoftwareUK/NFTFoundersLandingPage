# OASISNFTStore — White-Label NFT Campaign Platform

> Cross-chain NFT campaign platform: OpenSea + Pannax + OASIS Web6. Anyone creates a fundraise/NFT campaign in minutes using AI.

---

## Vision

OASISNFTStore is a **white-label, multi-tenant NFT campaign platform** built on the OASIS Web6 infrastructure. It lets any creator, brand, or project spin up a fully branded NFT campaign page — with custom tiers, perks, metadata, and imagery — using an AI wizard powered by the OASIS Web6 API. The existing OASIS Founders campaign becomes the first live template and proof of concept.

---

## Repository

**New repo:** `OASISNFTStore` (separate from NFTFoundersLandingPage)
- Reuses all payment infrastructure from the Founders site verbatim (Stripe, SOL, ETH/USDT, BTC)
- Reuses `api/oasis.js` mint logic as the core engine
- Reuses all CSS design tokens, fonts (Orbitron/Rajdhani/Share Tech Mono), and the star-canvas aesthetic
- Adds a CMS layer (Redis-backed) on top to make everything configurable per campaign

---

## Core Concepts

| Concept | Description |
|---|---|
| **Campaign** | A single NFT drop — has tiers, branding, pricing, supply limits, perks |
| **Tier** | A named level within a campaign (e.g. Genesis / Core / Supporter) — maps directly to a mintable NFT |
| **Creator** | The person/project running the campaign — gets a creator portal to manage it |
| **Template** | A pre-built visual theme for a campaign page; creators pick one and customise |
| **Platform Admin** | OASIS-side superadmin that can see/manage all campaigns and creators |

---

## Tech Stack

Keeps the existing battle-tested stack, adds a CMS and auth layer:

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (same as Founders) — no framework, Vercel-hosted |
| API | Vercel Serverless Functions (Node.js ESM) |
| Database | Redis (Upstash) — multi-key namespaced per campaign |
| Payments | Stripe + Solana (Phantom) + EVM USDT (ETH/BNB/MATIC) + BTC |
| Minting | OASIS Web6 API (`/api/nft/mint-nft`) |
| AI Generation | OASIS Web6 API (prompt → campaign config JSON) |
| Email | Resend |
| Auth (Creators) | JWT tokens stored in Redis (no third-party OAuth needed) |
| Auth (Admin) | Password-based (same as current admin.html) |

---

## Vercel Function Budget

Vercel Hobby limit is **12 serverless functions**. Plan carefully:

| # | File | Purpose |
|---|---|---|
| 1 | `api/config.js` | Public campaign config GET + admin POST |
| 2 | `api/campaigns.js` | Campaign CRUD (list / create / update / delete) |
| 3 | `api/tiers.js` | Tier CRUD per campaign |
| 4 | `api/generate.js` | AI campaign wizard — calls OASIS Web6 |
| 5 | `api/auth.js` | Creator login / register / me |
| 6 | `api/createPayment.js` | Stripe PaymentIntent (reused) |
| 7 | `api/create-sol-order.js` | SOL order creation (reused) |
| 8 | `api/verify-sol-payment.js` | SOL payment verify (reused) |
| 9 | `api/verify-card-payment.js` | Stripe payment verify (reused) |
| 10 | `api/oasis.js` | Mint NFT via OASIS (reused) |
| 11 | `api/orders.js` | Orders list + gift orders |
| 12 | `api/notify.js` | Email notifications + webhooks (reused) |

> If we hit the limit: consolidate `auth.js` into `campaigns.js` using action params (same pattern as current `config.js`).

---

## Redis Key Schema

All keys are namespaced by `campaignId` so all campaigns share one Redis instance:

```
# Platform-level
platform:campaigns                  SET of all campaign IDs
platform:creators                   SET of all creator IDs
platform:slug:{slug}                STRING → campaignId (slug → ID lookup)

# Creator
creator:{creatorId}                 JSON { id, email, username, passwordHash, name, bio, avatarUrl, createdAt }
creator:email:{email}               STRING → creatorId
creator:token:{token}               STRING → creatorId (JWT sessions, TTL 30d)
creator:{creatorId}:campaigns       SET of campaign IDs owned by this creator

# Campaign
campaign:{id}                       JSON { id, slug, creatorId, status, template, config, branding, createdAt, publishedAt }
campaign:{id}:tiers                 LIST of tier IDs (ordered)
campaign:tier:{tierId}              JSON { id, campaignId, name, symbol, price{USD,SOL,ETH}, supply, perks[], metadata{}, imageUrl, order }
campaign:{id}:mint_count:{tierId}   INT
campaign:{id}:waitlist:emails       SET
campaign:{id}:waitlist:meta:{email} JSON { overrides per tier }
campaign:{id}:order:{orderId}       JSON (same shape as current Founders orders)

# Templates (read-only seed data)
template:{templateId}               JSON { id, name, desc, previewUrl, cssVars, config }
```

---

## Campaign Config JSON Shape

Stored in `campaign:{id}` — drives the entire campaign page render:

```json
{
  "id": "abc123",
  "slug": "my-awesome-drop",
  "creatorId": "creator456",
  "status": "published",
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
      "name": "Genesis",
      "symbol": "GEN",
      "priceUSD": 500,
      "priceSol": null,
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
  "legal": {
    "termsUrl": null,
    "privacyUrl": null
  },
  "analytics": {
    "totalRevenue": 0,
    "totalMints": 0
  }
}
```

---

## Frontend Pages

All pages share the same nav/footer shell and CSS variable system from Founders. The dynamic campaign page (5) is the main consumer of all the existing Founders page code.

| # | Path | File | Description |
|---|---|---|---|
| 1 | `/` | `index.html` | Marketplace — browse all published campaigns |
| 2 | `/create` | `create.html` | AI campaign wizard (Web6 prompt → config) |
| 3 | `/templates` | `templates.html` | Browse pre-built templates |
| 4 | `/campaign/[slug]` | `campaign.html` | Dynamic campaign landing page (loads config via API, renders template) |
| 5 | `/dashboard` | `dashboard.html` | Creator dashboard — my campaigns list |
| 6 | `/dashboard/edit` | `dashboard-edit.html` | Edit campaign — CMS form with live preview |
| 7 | `/dashboard/orders` | `dashboard-orders.html` | Creator order/revenue view |
| 8 | `/dashboard/analytics` | `dashboard-analytics.html` | Per-campaign charts, revenue, mints |
| 9 | `/admin` | `admin.html` | Platform admin — all campaigns, creators, orders |
| 10 | `/admin/campaigns` | `admin-campaigns.html` | All campaigns table + approve/suspend |
| 11 | `/admin/creators` | `admin-creators.html` | All creators + override pricing |
| 12 | `/admin/analytics` | `admin-analytics.html` | Platform-wide revenue charts |

---

## Templates

Creators pick a template when creating a campaign. They can still customise colours, fonts, and copy within the template.

### Template 1 — OASIS Founders *(exact clone of current site)*
- Dark space theme: `--bg-deep:#030714`, stars canvas, cyan glow
- Orbitron/Rajdhani/Share Tech Mono fonts
- 3-tier card layout (gold Genesis / blue Core / green Supporter)
- Animated hero, scroll-to-mint flow
- This IS the current Founders page — just parameterised

### Template 2 — Clean Minimal
- White/light background, OpenSea-inspired
- Clean sans-serif (Inter)
- Card-grid NFT display
- Simple pricing table

### Template 3 — Dark Luxury
- Near-black background, gold accents throughout
- Premium serif headings (Playfair Display)
- Oversized hero imagery
- Suitable for high-value art drops

### Template 4 — Gaming Guild
- Purple/green neon palette
- Bold headers, XP/level language
- Guild tier naming (Bronze/Silver/Gold/Diamond)
- Animated border effects

### Template 5 — DeFi Protocol
- Dark blue/electric blue
- Data-dashboard aesthetic, numeric stats prominently displayed
- Protocol tokenomics language
- TVL/APY callout sections

### Template 6 — Art Collection
- Gallery-style white/cream
- Large image-first layout
- Artist profile section
- Exhibition-inspired typography

---

## AI Campaign Generator (OASIS Web6)

The centrepiece feature. A creator writes a plain-English prompt; the OASIS Web6 API returns a complete campaign config JSON.

### User Flow

```
1. Creator visits /create
2. Enters: project name + free-text description
   e.g. "A Web3 gaming guild called DragonForge — 3 tiers: 
        Bronze 50 supply $50, Silver 20 supply $200, Gold 5 supply $1000.
        Perks: Bronze = Discord access; Silver = governance + revenue share;
        Gold = co-founder rights + 1:1 calls"
3. Clicks "Generate Campaign"
4. /api/generate calls OASIS Web6 AI endpoint with structured prompt
5. Returns populated campaign config JSON
6. Creator sees a live preview of their campaign page
7. They can tweak any field in the CMS editor
8. Pick template, upload images (or AI-generate prompt suggestions)
9. Connect wallet, pay platform fee (optional), publish
```

### Web6 API Integration

```
POST /api/generate
Body: { prompt, creatorId, template }

Calls: POST {OASIS_API_URL}/api/ai/generate-nft-campaign
       Body: { prompt, schema: CAMPAIGN_CONFIG_SCHEMA }

Returns: populated campaign config JSON matching our schema
```

We send our schema alongside the prompt so the AI returns structured, validated output ready to save directly.

### Image Generation
- The AI also returns **image prompts** per tier (e.g. "glowing golden dragon shield, sci-fi art, dark background")
- Creator can use these prompts in any image tool (Midjourney, DALL-E, Stable Diffusion) or we integrate directly via OASIS image API
- Images upload to a CDN (Vercel Blob or existing OASIS image CDN)

---

## Creator Auth Flow

Simple, no OAuth dependencies:

```
Register:  POST /api/auth  { action:"register", email, username, password }
           → creates creator in Redis, returns JWT (stored in localStorage)

Login:     POST /api/auth  { action:"login", email, password }
           → validates bcrypt hash, returns JWT

Session:   GET  /api/auth  + Authorization: Bearer {token}
           → validates Redis token, returns creator profile

Logout:    DELETE /api/auth → deletes Redis token
```

JWT tokens are random 32-byte hex strings stored in Redis with 30-day TTL. No JWT signing library needed.

---

## Platform Fees (Optional)

Two models to support:

1. **Free**: Platform is open, no fee — OASIS drives ecosystem growth
2. **Revenue share**: Platform takes X% of each sale (configurable per creator tier)
3. **Subscription**: Creator pays monthly flat fee via Stripe for premium features

Phase 1 launches with model 1 (free) to maximise adoption. Fee config can be wired in later.

---

## Admin Features (Multi-page)

### `/admin` — Dashboard Home
- Total campaigns, creators, mints, revenue (all-time)
- Recent activity feed
- System health (Redis ping, OASIS API status)

### `/admin/campaigns` — Campaign Management
- Table: all campaigns with status (draft/published/suspended)
- Actions: view, approve/suspend, view orders, delete
- Namespace selector (test/live/archived — same as current admin)
- Search/filter by creator, status, template, chain

### `/admin/creators` — Creator Management
- Table: all creators with email, campaign count, total revenue
- Actions: view, suspend account, set pricing overrides
- Creator detail modal: their campaigns, orders, revenue

### `/admin/analytics` — Platform Analytics
- Revenue chart (daily/weekly/monthly) — per chain breakdown
- Mint volume chart
- Campaign performance comparison
- Creator leaderboard
- Chain distribution pie chart

### `/admin/orders` — All Orders
- All orders across all campaigns
- Filter by campaign, status, chain, date
- Bulk operations (export CSV)
- Same detailed view as current admin orders table

---

## Campaign Creator Dashboard

### `/dashboard` — My Campaigns
- Cards for each campaign with status, mint progress bars, quick stats
- "Create New Campaign" CTA → `/create`
- Revenue summary across all campaigns

### `/dashboard/edit?campaign={id}` — CMS Editor
- Left: live preview of campaign page (iframe or re-render)
- Right: tabbed form editor
  - **Branding**: name, tagline, description, logo, banner, colours
  - **Tiers**: drag-reorder, add/remove tiers, per-tier form (name, price, supply, perks, image, metadata)
  - **Settings**: which chains to accept, waitlist on/off, gift on/off, mint open/closed
  - **Legal**: terms/privacy URLs
  - **Publish**: URL slug chooser, go live toggle

### `/dashboard/orders?campaign={id}` — Orders
- Filtered view of orders for that campaign
- Same table as current admin but creator-scoped
- Download CSV for accounting

### `/dashboard/analytics?campaign={id}` — Analytics
- Mint progress per tier (bar chart)
- Revenue over time (line chart)
- Chain breakdown (pie)
- Waitlist size over time

---

## Dynamic Campaign Page (`/campaign/[slug]`)

`campaign.html` is a single file that:
1. Reads `?slug=` or parses path segment
2. Calls `GET /api/config?slug={slug}` → returns full campaign config
3. Injects CSS variables from `branding.primaryColor` etc.
4. Loads the correct template JS/CSS module for `campaign.template`
5. Renders tiers, hero, features, etc. from `config` data
6. The payment/mint flow is identical to the current Founders flow — same APIs, same modal

Template rendering is done client-side via JS template modules:

```js
// campaign.html boots like this
const config = await fetch('/api/config?slug=' + slug).then(r => r.json());
const template = await import(`/templates/${config.template}/render.js`);
template.render(config);
```

Each template is a `render.js` that takes the config JSON and writes the DOM — the Founders template's `render.js` is essentially the current `index.html` logic, extracted and parameterised.

---

## Marketplace (`/`)

The homepage is a campaign discovery page:

- Hero: "Launch your own NFT campaign with AI"
- CTA: "Create Campaign" (→ `/create`) + "Browse Templates" (→ `/templates`)
- **Featured Campaigns** grid — curated by admin
- **All Campaigns** paginated grid — sorted by most recent / most minted
- Filter by: chain, template, status (minting now / sold out / upcoming)
- Each card: campaign name, image, tier count, price range, progress bar

---

## Phase Plan

### Phase 1 — Core Infrastructure (Week 1–2)
- [ ] Create `OASISNFTStore` repo, copy Founders site as starting point
- [ ] Redis key schema implementation
- [ ] `api/campaigns.js` — CRUD for campaigns
- [ ] `api/tiers.js` — CRUD for tiers
- [ ] `api/auth.js` — creator register/login/me
- [ ] `api/config.js` — updated to serve campaign config by slug
- [ ] Seed the database with the Founders campaign as campaign ID `oasis-founders`
- [ ] Keep existing payment APIs (`createPayment`, `create-sol-order`, etc.) working with campaign-scoped keys

### Phase 2 — Founders Template (Week 2–3)
- [ ] Extract current `index.html` into `templates/founders/render.js`
- [ ] Parameterise all hardcoded Founders values (tier names, prices, images, copy) to read from config
- [ ] `campaign.html` — dynamic campaign page shell that loads template
- [ ] Verify the Founders campaign page is pixel-perfect using the template
- [ ] `templates.html` — template gallery with previews

### Phase 3 — AI Generator (Week 3–4)
- [ ] `api/generate.js` — OASIS Web6 integration, structured prompt → campaign config JSON
- [ ] `create.html` — AI wizard UI: prompt input, loading state, results preview
- [ ] CMS editor (basic) — tweak AI-generated config before saving
- [ ] Image prompt suggestions displayed alongside tier config

### Phase 4 — Creator Dashboard (Week 4–5)
- [ ] `dashboard.html` — campaign list for logged-in creator
- [ ] `dashboard-edit.html` — full CMS editor with live preview panel
- [ ] `dashboard-orders.html` — creator-scoped order view
- [ ] `dashboard-analytics.html` — per-campaign charts (Chart.js inline)

### Phase 5 — Marketplace (Week 5–6)
- [ ] `index.html` (homepage) — campaign discovery grid
- [ ] Campaign card component (shared across pages)
- [ ] Search/filter (client-side for MVP, Redis-backed search later)
- [ ] Featured campaigns system (admin can pin campaigns)

### Phase 6 — Platform Admin (Week 6–7)
- [ ] `admin.html` — expanded multi-page admin (matches current admin layout)
- [ ] `admin-campaigns.html` — all campaigns table + approve workflow
- [ ] `admin-creators.html` — creator management
- [ ] `admin-analytics.html` — platform-wide charts

### Phase 7 — Additional Templates (Week 7–8)
- [ ] Template 2: Clean Minimal
- [ ] Template 3: Dark Luxury
- [ ] Template 4: Gaming Guild
- [ ] Template 5: DeFi Protocol
- [ ] Template 6: Art Collection

### Phase 8 — Advanced Features (Week 8+)
- [ ] Platform fee system (revenue share config per creator)
- [ ] Royalties config in campaign settings (passed to OASIS mint payload)
- [ ] Custom domain support (each campaign gets `{slug}.oasisnftstore.io` or custom CNAME)
- [ ] Embed widget (iframe or JS snippet for external sites)
- [ ] Webhook system (creators get notified on each sale)
- [ ] Bulk CSV import for waitlists
- [ ] Multi-language support (i18n layer on campaign config)
- [ ] Secondary market / resale integration (OASIS marketplace feed)

---

## Environment Variables (additions to existing)

```env
# New for OASISNFTStore
PLATFORM_ADMIN_PASSWORD=...          # superadmin password
JWT_SECRET=...                       # for creator sessions (32 random bytes hex)
PLATFORM_FEE_PERCENT=0               # 0 = free for now
OASIS_WEB6_API_URL=...               # AI generation endpoint
VERCEL_BLOB_RW_TOKEN=...             # for image uploads (Vercel Blob)

# Existing — unchanged
REDIS_URL=...
TEST_MODE=false
STRIPE_PK_LIVE=...
STRIPE_SK_LIVE=...
OASIS_API_URL_LIVE=...
OASIS_AVATAR_USERNAME_LIVE=...
OASIS_AVATAR_PASSWORD_LIVE=...
OASIS_AVATAR_ID_LIVE=...
EVM_RECEIVER=...
BTC_ADDR=...
TREASURY_WALLET_SOL=...
RESEND_API_KEY=...
EMAIL_FROM=...
COLLECTION_PUBLIC_KEY_MAINNET=...
```

---

## Reuse Inventory from NFTFoundersLandingPage

| Asset | Reuse decision |
|---|---|
| `api/oasis.js` | Copy verbatim — becomes the mint engine for all campaigns |
| `api/createPayment.js` | Copy verbatim — Stripe path |
| `api/create-sol-order.js` | Copy verbatim |
| `api/verify-sol-payment.js` | Copy verbatim |
| `api/verify-card-payment.js` | Copy verbatim |
| `api/notify.js` | Copy verbatim |
| `lib/solPrice.js` | Copy verbatim |
| `lib/rateLimit.js` | Copy verbatim |
| `lib/verifySolTx.js` | Copy verbatim |
| `img/nft-*.png` | Use as Founders template defaults; creators upload their own |
| `metadata/*.json` | Template defaults |
| CSS design tokens | All CSS variables become the Founders template defaults |
| Star canvas JS | Shared utility across all dark templates |
| Payment modal HTML/JS | Extracted to shared `components/payment-modal.js` |
| Admin auth pattern | Same password-in-Redis pattern for platform admin |
| Redis test/archived namespace system | Inherited unchanged |
| `scripts/*.mjs` | Copy and extend for multi-campaign support |

---

## Key Design Decisions

1. **No framework** — keeps the same fast-loading vanilla approach that makes Founders work on Vercel Hobby
2. **Template = JS module** — each template is a `render.js` that takes config JSON; avoids a build step
3. **Campaign = Redis namespace** — all campaign data is isolated by `campaign:{id}:*` prefix; same Redis instance scales to many campaigns
4. **Founders campaign = first campaign** — seeded on deploy; proves backward compat; users of the Founders URL get redirected to `/campaign/oasis-founders`
5. **AI is additive** — creators can skip AI and build manually; Web6 just accelerates the wizard
6. **Payment APIs are campaign-agnostic** — they just need `campaignId` in the order body; no code changes needed
7. **Admin auth stays password-only** — no OAuth complexity; platform admin is internal OASIS staff only

---

## Open Questions

1. **Custom domains**: Should each campaign get a subdomain (`slug.oasisnftstore.io`) or a path (`oasisnftstore.io/campaign/slug`)? Subdomain requires Vercel Pro wildcard cert — start with path routing on Hobby, offer subdomain on Pro.
2. **Image hosting**: Use Vercel Blob (free tier: 500MB) or the existing OASIS image CDN? Recommend OASIS CDN to keep image delivery within the OASIS ecosystem.
3. **OASIS Web6 AI endpoint**: Need to confirm the exact endpoint and auth method for the campaign generation API. Is it the same JWT/avatar auth as the existing mint API?
4. **Platform fee model**: Confirm with David whether Phase 1 is free-to-create or if there's a launch fee.
5. **Campaign approval**: Should new campaigns be auto-published or require admin approval to go live on the marketplace?
6. **Pannax-style features**: Pannax appears to focus on community and DAO tooling — should we include DAO governance hooks (proposal voting, snapshot.org integration) in a later phase?
