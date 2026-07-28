# mepcoapk — Saleem Electric Dashboard

Capacitor-wrapped meter management dashboard for MEPCO bills.
**Backend: [Convex](https://convex.dev)** (deployment `dev:determined-dotterel-142`).

---

## Layout

```
convex/                 Backend: schema + query/mutation functions
  schema.ts             bills / loads / meta tables + indexes
  dashboard.ts          getAll — one consistent snapshot for the whole UI
  meters.ts             list / upsert / remove
  loads.ts              list / create / remove (cascades unlink)
  meta.ts               list / setLoads / setStatus
  migrate.ts            one-time Supabase importer
scripts/
  migrate-from-supabase.mjs   pulls Supabase rows → migrate:importFromSupabase
www/
  index.html            the app
  convex-config.js      deployment URL (public, safe to commit)
  vendor/convex-browser.js    vendored Convex browser client
```

## Setup

```bash
npm install
cp .env.local.example .env.local     # then paste your deploy key into it
npx convex dev                       # pushes convex/ and watches for changes
```

`.env.local` is git-ignored — the deploy key must never be committed.

To push the functions once without watching:

```bash
npx convex deploy
```

## Data model

Table | Key | Notes
--- | --- | ---
`bills` | `reference_no` | meter register + readings; `units_consumed` is derived server-side
`loads` | `load_id` | distribution loops; `load_id` is the stable client id (`load_<timestamp>`)
`meta` | `ref` | per-meter `status` + `load_ids` (a real array, not a JSON string)

Each key has a matching index (`by_reference_no`, `by_load_id`, `by_ref`), so
every lookup is an index scan rather than a full table read.

## What changed from Supabase

- **One query instead of three.** The UI previously fired three parallel REST
  calls (`bills`, `loads`, `meta`) that could each land on a different snapshot.
  `dashboard:getAll` returns all three from one transaction.
- **Live updates.** The app subscribes over a WebSocket, so a change made on one
  phone shows up on another without pressing Sync. The Sync button still works
  as a manual one-shot refresh.
- **Atomic multi-table writes.** Deleting a meter removes its `bills` and `meta`
  rows in a single transaction; renaming a meter's reference number moves its
  status/load assignment across in the same mutation. Both were non-atomic
  two-request sequences before.
- **Deleting a load unlinks it everywhere,** instead of leaving dangling ids in
  `meta.load_ids`.
- **`load_ids` is a typed array.** The old code did `JSON.stringify` on write and
  `JSON.parse` in a try/catch on read.
- **Status edits no longer rewrite the load assignment.** The old `meta` upsert
  resent the whole row from possibly-stale client state; `meta:setStatus` patches
  one field.
- **No CDN at runtime.** The Supabase client was fetched from jsdelivr on every
  launch, which broke the app offline or behind a filtered network. The Convex
  client is vendored into `www/vendor/`.
- **Validated inputs.** Every mutation declares argument validators, so malformed
  writes are rejected at the boundary.

## Migrating existing Supabase data

Run once, after the Convex functions are deployed:

```bash
export SUPABASE_URL='https://uukinwggdaxolqkbcjyj.supabase.co'
export SUPABASE_KEY='<supabase anon or service_role key>'
export CONVEX_URL='https://determined-dotterel-142.convex.cloud'

node scripts/migrate-from-supabase.mjs --dry-run   # preview
node scripts/migrate-from-supabase.mjs             # import
```

It is idempotent — rows are matched on `reference_no` / load id / `ref`, so
re-running updates rather than duplicates. It also converts the old
JSON-string `load_ids` into real arrays and coerces null readings to `0`.

## Building the APK

`.github/workflows/android-build.yml` deploys the Convex functions and then
builds the debug APK. Add the deploy key as a repository secret named
**`CONVEX_DEPLOY_KEY`** (Settings → Secrets and variables → Actions). If the
secret is absent the deploy step is skipped and the APK still builds.

Optionally set a repository variable `CONVEX_URL` to point a build at a
different deployment; otherwise the value in `www/convex-config.js` is used.

## Updating the vendored client

After bumping the `convex` dependency:

```bash
npm run vendor:convex
```

## Note on secrets

`www/convex-config.js` contains only the deployment **URL**, which is public by
design — it ships in every Convex web client. The **deploy key is a secret**:
keep it in `.env.local` and in GitHub Actions secrets, never in `www/`.
Anything sensitive belongs behind authorization checks inside the Convex
functions, since everything under `www/` is readable inside the APK.
