# Standing up a new school

This repo is a template for GeoGuessr-style campus games. Everything
school-specific lives in three places:

| What | Where |
|---|---|
| Names, map, scoring, timezone, key prefixes, backend defaults | `src/config/school.ts` |
| Secrets & per-deployment service config | `.env.local` / Vercel env (see `.env.example`) |
| Art (backgrounds, favicon, cosmetics) & palette | `public/branding/`, `public/cosmetics/school/<slug>/`, top of `src/index.css` |

A new school never needs to touch game logic. Follow the checklist in order.

## 1. Clone the template

Use GitHub's "Use this template" button (or clone + re-init git). Name the
repo `<slug>-guessr`. Update `name` in `package.json` if you care.

## 2. Fill in `src/config/school.ts`

Every field is documented inline. The important ones:

- `slug` — lowercase id (`sfu`). Drives storage keys and defaults.
- `map.center` / `map.bounds` — get these from OpenStreetMap. Bounds should
  hug campus with a little margin; the map won't pan outside them.
- `scoring.falloffC` — 0.46 suits a UBC-sized campus (~2 km across). Smaller
  campus → smaller c (steeper penalty), e.g. ~0.3 for a campus 1 km across.
  Rule of thumb: c ≈ (campus width in km) / 4.
- `scoring.titles` — your school-flavored rank ladder, highest `minPct` first.
- `storagePrefix` / `backendDefaults.kvKeyPrefix` — normally just the slug.
- `backendDefaults.dynamoTableName` — e.g. `SFUGuessrLocations`.
- `backendDefaults.photoBaseUrl` — your S3 bucket URL (step 6).

## 3. Branding assets & palette

- Replace `public/branding/bg.jpg` (start-screen background), `bgr.jpg`
  (party-mode background), `favicon.jpg`.
- Edit the `SCHOOL PALETTE` block at the top of `src/index.css` — the
  "navy" tokens are your dominant dark brand color, "gold" the accent.
  Nothing below the palette block should need changes.

## 4. Cosmetics pack (optional — generic items work out of the box)

1. Copy `src/data/cosmeticsPacks/ubc.ts` → `cosmeticsPacks/<slug>.ts`, rename
   the export, and describe your items.
2. Register it in `COSMETIC_PACKS` in `src/data/cosmetics.ts` and set
   `cosmeticsPackId: '<slug>'` in `school.ts`.
3. Put art in `public/cosmetics/school/<slug>/`. Layer conventions (see the
   `CosmeticDefinition` interface): shirts need `_body`, `_lsleeve`,
   `_rsleeve` PNGs plus an `_icon` preview; hats/glasses/moustaches need the
   asset plus `_icon`. Match the canvas of the base avatar parts in
   `public/cosmetics/avatar/` (aspect ratio 427:584). Mascot-style heads can
   set `hidesBaseHead: true`.

If you skip this, set `cosmeticsPackId` to a name with no pack (e.g. `none`)
and only generic items appear.

## 5. Backend resources (each school gets its own)

- **Clerk** (auth): create an application at dashboard.clerk.com. Grab the
  publishable key + issuer. Add a webhook pointing at
  `https://<site>/api/webhooks/clerk` subscribed to `user.*` events; grab its
  signing secret.
- **AWS**: create a DynamoDB table (partition key `id`, type String) and an
  S3 bucket for photos with public read (or CloudFront in front). Create an
  IAM user with read access to the table for the app, and write access for
  you to run the seed scripts.
- **Vercel**: create the project (framework: Vite), attach a **KV store**
  (auto-injects `KV_*` env vars). The daily cron in `vercel.json` deploys
  automatically; set `CRON_SECRET`.
- **Supabase** (party mode): create a project, then run
  `supabase/party_mode_schema.sql` followed by the three migration `.sql`
  files in `supabase/` against it (SQL editor). Grab URL + service role key.

## 6. Environment variables

Copy `.env.example` → `.env.local`, fill it in, and set the same values in
the Vercel project. Then validate:

```sh
node scripts/setup-check.mjs            # env presence
node scripts/setup-check.mjs --connect  # live probes of every service
```

## 7. Photos & locations

1. Shoot 360° panoramas across campus (a 360 camera export like `GS__0210.JPG`
   works; any consistently named JPGs are fine). Record GPS coordinates per
   photo (camera EXIF or pin them manually on a map).
2. Upload the JPGs to the S3 bucket (filenames must match the JSON).
3. Create `src/data/locations.<slug>.json` — same shape as
   `locations.ubc.json`: `{ id, filename, coordinates: [lat, lng], label }`.
   Use `coordinates: null` to keep a photo out of rotation.
4. Point the import in `src/data/locations.ts` at your JSON file.
5. Seed DynamoDB:

```sh
DYNAMO_TABLE_NAME=<YourTable> LOCATIONS_FILE=locations.<slug>.json \
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... node scripts/seedDynamoDB.js
```

Optional: mark a location as a daily challenge with
`scripts/addDailyChallenge.mjs` (same env vars).

## 8. Ship it

```sh
node scripts/generate-sitemap.mjs   # regenerates public/sitemap.xml from siteUrl
npm run build                       # sanity check
vercel deploy --prod
```

Smoke test on the deployed site: guest game (5 rounds, scores sensible for
your campus size), sign-in, leaderboard write, party mode with two browsers,
daily challenge, avatar shop purchase, share endcard (should show your
school's name), promo code if configured.

## Keeping up with the template

Add the template as a second remote to receive fixes:

```sh
git remote add template git@github.com:dreammy222/campus-guessr-template.git
git fetch template && git merge template/main   # or cherry-pick
```

Because school-specific state is confined to `school.ts`, JSON data, env,
and assets, template merges rarely conflict.
