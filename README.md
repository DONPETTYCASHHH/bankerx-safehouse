# BankerX ERI — Estate Risk Index Dashboard

Reputation intelligence for South African residential estates. Combines Google Maps reviews, sentiment analysis, and operational risk scoring into a single dashboard for homebuyers and investors.

---

## Stack

- **Frontend** — React (Next.js)
- **Data** — DataForSEO Business Data API (Google Reviews)
- **Search** — DataForSEO Google Maps Search API
- **Cache** — File-based JSON cache (7-day TTL, zero infra cost to start)

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/bankerx-eri.git
cd bankerx-eri
npm install
```

### 2. Add credentials

```bash
cp .env.example .env.local
```

Edit `.env.local` with your DataForSEO credentials from [app.dataforseo.com](https://app.dataforseo.com/api-dashboard).

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project structure

```
├── components/
│   └── reputation_dashboard_preview.jsx   # Main dashboard UI
├── pages/
│   ├── index.js                           # Mount point
│   └── api/
│       ├── estate-search.js               # Autocomplete → DataForSEO Maps
│       └── eri-scan.js                    # Full ERI scan → DataForSEO Reviews
├── lib/
│   └── cache.js                           # File-based JSON cache (7-day TTL)
├── .cache/                                # Auto-created, gitignored
├── .env.example
└── .gitignore
```

---

## Cost protection

Three layers protect your DataForSEO budget:

| Layer | What it does |
|---|---|
| **Debounce** | Search fires only after 500ms of no typing |
| **Minimum chars** | Search requires 3+ characters before firing |
| **7-day cache** | Repeat scans of the same estate are free |
| **Daily cap** | `DAILY_SCAN_LIMIT` fresh scans per IP per day (default: 3) |
| **Cache-first** | Every scan checks cache before hitting the API |
| **Force refresh UX** | Cached results shown with age + optional refresh button |

Cache files live in `.cache/` (gitignored). Delete the folder to clear all cached results.

---

## Upgrading the cache

The current file-based cache works well for low traffic. When you scale:

- **Redis** (Upstash free tier) — swap `lib/cache.js` for `ioredis` calls, same interface
- **Vercel KV** — drop-in if deploying to Vercel

---

## DataForSEO endpoints used

| Endpoint | Purpose | Pricing tier |
|---|---|---|
| `serp/google/maps/live/advanced` | Estate search autocomplete | Standard |
| `business_data/google/reviews/task_post` | Full review pull (async) | Cheaper than live |
| `business_data/google/reviews/task_get` | Poll for review results | Free (polling) |

Using async task endpoints (`task_post` + `task_get`) instead of live endpoints saves ~40% on review pull costs.

---

## Disclaimer

Educational analytics only. Not property, legal, or financial advice 
