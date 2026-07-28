#!/usr/bin/env node
/**
 * One-time migration: copy the `bills`, `loads` and `meta` tables out of the
 * old Supabase project and into the Convex deployment.
 *
 * Usage:
 *   export SUPABASE_URL='https://uukinwggdaxolqkbcjyj.supabase.co'
 *   export SUPABASE_KEY='<anon or service_role key>'
 *   export CONVEX_URL='https://determined-dotterel-142.convex.cloud'
 *   node scripts/migrate-from-supabase.mjs
 *
 * Add --dry-run to print what would be imported without writing to Convex.
 *
 * Safe to re-run: the importer matches on reference_no / load id / ref, so a
 * second run updates the existing rows instead of duplicating them.
 */
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const CONVEX_URL = (
  process.env.CONVEX_URL || "https://determined-dotterel-142.convex.cloud"
).replace(/\/+$/, "");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_KEY before running this migration.\n" +
      "The key must be allowed to read the bills, loads and meta tables.",
  );
  process.exit(1);
}

async function fetchTable(table) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=*`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `Supabase read of "${table}" failed: ${res.status} ${await res.text()}`,
    );
  }
  return await res.json();
}

const str = (x) => (x === null || x === undefined ? null : String(x));
const num = (x) => (x === null || x === undefined || x === "" ? null : Number(x));

async function main() {
  console.log(`Reading from Supabase ${SUPABASE_URL} …`);
  const [rawBills, rawLoads, rawMeta] = await Promise.all([
    fetchTable("bills"),
    fetchTable("loads"),
    fetchTable("meta"),
  ]);
  console.log(
    `  bills=${rawBills.length}  loads=${rawLoads.length}  meta=${rawMeta.length}`,
  );

  // Normalise into exactly the shape convex/migrate.ts validates.
  const bills = rawBills
    .filter((b) => b.reference_no !== null && b.reference_no !== undefined)
    .map((b) => ({
      reference_no: String(b.reference_no),
      meter_name: str(b.meter_name),
      last_month_mepco_reading: num(b.last_month_mepco_reading),
      manual_reading: num(b.manual_reading),
      manual_reading_date: str(b.manual_reading_date),
    }));

  const loads = rawLoads
    .filter((l) => l.id !== null && l.id !== undefined)
    .map((l) => ({ id: String(l.id), name: str(l.name) }));

  const meta = rawMeta
    .filter((m) => m.ref !== null && m.ref !== undefined)
    .map((m) => ({
      ref: String(m.ref),
      status: str(m.status),
      load_ids: Array.isArray(m.load_ids) ? m.load_ids.map(String) : str(m.load_ids),
      load_since: str(m.load_since),
    }));

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Payload preview:");
    console.log(JSON.stringify({ bills, loads, meta }, null, 2).slice(0, 4000));
    return;
  }

  console.log(`Writing to Convex ${CONVEX_URL} …`);
  const convex = new ConvexHttpClient(CONVEX_URL);
  const report = await convex.mutation(anyApi.migrate.importFromSupabase, {
    bills,
    loads,
    meta,
  });

  console.log("Done:");
  console.log(`  bills  inserted=${report.bills.inserted} updated=${report.bills.updated}`);
  console.log(`  loads  inserted=${report.loads.inserted} updated=${report.loads.updated}`);
  console.log(`  meta   inserted=${report.meta.inserted} updated=${report.meta.updated}`);
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message || err);
  process.exit(1);
});
