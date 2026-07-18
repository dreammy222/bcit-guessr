# campus-guessr-template

White-label template for **GeoGuessr-style campus games**. Each school gets
its own repo, deployment, and backend accounts cloned from this template —
the gameplay, UI, and code stay shared so every game is recognizably part of
the same family (UBCGuessr, SFUGuessr, …).

Players are shown 360° panorama photos taken around campus and drop a pin on
a map; points fall off with distance and time. Includes accounts, a
leaderboard, a daily challenge, real-time party mode, and an avatar shop
with coin-purchasable cosmetics.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite, Leaflet (map), CSS custom properties |
| API | Vercel serverless functions in `api/` (mix of Node and Edge runtimes) |
| Auth | Clerk |
| Locations DB | AWS DynamoDB (falls back to local JSON in dev) |
| Leaderboard / daily / rate limits | Vercel KV |
| Party mode | Supabase (Postgres + REST) |
| Photos | S3 bucket (any public HTTP host works) |

## What makes it a template

All school-specific state is confined to four places — game logic never
changes between schools:

1. **`src/config/school.ts`** — single config file: names, tagline, site URL,
   map center/bounds/zoom, scoring curve + rank titles, timezone,
   storage-key prefix, backend default names, cosmetics pack.
2. **Env vars** — every secret and service handle, documented in
   [`.env.example`](.env.example). Validate with
   `node scripts/setup-check.mjs [--connect]`.
3. **Assets** — `public/branding/` (backgrounds, favicon),
   `public/cosmetics/school/<slug>/` (school shop items), and the
   `SCHOOL PALETTE` block at the top of `src/index.css` (~15 CSS variables
   recolor the whole UI).
4. **`src/data/locations.<slug>.json`** — the photo locations, one JSON file
   per school.

## Cloning for a new school (every time)

The full checklist lives in **[NEW_SCHOOL.md](NEW_SCHOOL.md)** — follow it
top to bottom. The short version:

```sh
# 1. On GitHub: "Use this template" → create <slug>-guessr under your account
#    (or locally: git clone <this repo> <slug>-guessr && rename the remote)
git clone git@github.com:dreammy222/<slug>-guessr.git
cd <slug>-guessr
npm install

# 2. Keep a link to the template so you can pull future fixes
git remote add template git@github.com:dreammy222/campus-guessr-template.git

# 3. Make it the new school's game (details in NEW_SCHOOL.md):
#    - fill in src/config/school.ts
#    - edit the SCHOOL PALETTE block in src/index.css
#    - replace public/branding/ images
#    - create src/data/locations.<slug>.json + point locations.ts at it

# 4. Play it locally with ZERO cloud accounts (placeholder images are fine):
echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_$(printf 'placeholder-dev.clerk.accounts.dev$' | base64)" > .env.local
npm run dev:api      # terminal 1 — real API handlers, in-memory state, :3001
npm run dev:local    # terminal 2 — vite on :5173 proxied to the dev API

# 5. When ready to ship: create Clerk/AWS/Vercel+KV/Supabase accounts,
#    fill .env per .env.example, seed DynamoDB, deploy to Vercel
#    (NEW_SCHOOL.md steps 5–8).

# 6. Push
git add -A && git commit -m "<slug> setup"
git push -u origin main
```

To pull template improvements into a school repo later:

```sh
git fetch template && git merge template/main   # or cherry-pick single fixes
```

## Development commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server; `/api` proxied to the deployed `siteUrl` |
| `npm run dev:api` | Local API server on :3001 — runs the real handlers from `api/` with no cloud backends (in-memory sessions, local locations JSON) |
| `npm run dev:local` | Vite proxied to the local dev API — full offline gameplay |
| `npm run build` | Production build (also fills the HTML title/meta from config) |
| `npx tsc --noEmit` | Typecheck |
| `node scripts/setup-check.mjs --connect` | Validate env vars and live-probe every backend service |
| `node scripts/seedDynamoDB.js` | Seed locations into DynamoDB (needs `DYNAMO_TABLE_NAME`, `LOCATIONS_FILE`, AWS creds) |
| `node scripts/generate-sitemap.mjs` | Regenerate `public/sitemap.xml` from the config `siteUrl` |

## Repo layout

```
src/config/school.ts        ← THE school config (edit per school)
src/config/storage.ts       ← prefixed localStorage keys
src/data/locations.*.json   ← per-school photo locations
src/data/cosmeticsPacks/    ← generic + per-school shop items
src/components/, src/party/ ← game UI (shared, don't fork per school)
api/                        ← Vercel serverless functions
api/_lib/serverConfig.ts    ← env-driven backend names (table, KV prefix, …)
public/branding/            ← per-school bg / favicon
public/cosmetics/           ← avatar + shop art (school/<slug>/ for packs)
scripts/                    ← seed, setup-check, dev API, sitemap
supabase/                   ← party-mode schema + migrations
NEW_SCHOOL.md               ← the full per-school setup checklist
```

## Existing deployments

| School | Repo | Status |
|---|---|---|
| UBC | `ce13ry/UBC-guessr` (pre-template original) | live at ubcguessr.com |
| SFU | `sfu-guessr` | in progress — placeholder photos, awaiting campus shoot |
