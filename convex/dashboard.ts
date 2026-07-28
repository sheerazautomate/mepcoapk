import { query } from "./_generated/server";

/**
 * Single round-trip used by the app on load / sync.
 *
 * Supabase needed three parallel HTTP requests (bills, loads, meta) that could
 * observe different snapshots. One Convex query returns all three tables from a
 * single consistent snapshot, and the client can subscribe to it over a
 * WebSocket so edits made on another device show up live.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const [bills, loads, meta] = await Promise.all([
      ctx.db.query("bills").collect(),
      ctx.db.query("loads").collect(),
      ctx.db.query("meta").collect(),
    ]);

    return {
      meters: bills.map((b) => ({
        ref: String(b.reference_no ?? "").trim(),
        name: String(b.meter_name ?? "").trim(),
        last: Number(b.last_month_mepco_reading) || 0,
        curr: Number(b.manual_reading) || 0,
        date: b.manual_reading_date ?? null,
      })),
      loads: loads.map((l) => ({ id: l.load_id, name: l.name })),
      meta: meta.map((m) => ({
        ref: String(m.ref ?? "").trim(),
        status: m.status || "Active",
        loadIds: m.load_ids ?? [],
        loadSince: m.load_since ?? null,
      })),
    };
  },
});
