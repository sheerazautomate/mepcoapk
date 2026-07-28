import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * One-shot importer for data exported out of the old Supabase project.
 *
 * Run it with the helper script:
 *   node scripts/migrate-from-supabase.mjs
 *
 * It is idempotent: rows are matched on `reference_no` / `load_id` / `ref`, so
 * re-running the import updates rather than duplicates.
 */
export const importFromSupabase = mutation({
  args: {
    bills: v.array(
      v.object({
        reference_no: v.string(),
        meter_name: v.optional(v.union(v.string(), v.null())),
        last_month_mepco_reading: v.optional(v.union(v.number(), v.null())),
        manual_reading: v.optional(v.union(v.number(), v.null())),
        manual_reading_date: v.optional(v.union(v.string(), v.null())),
      }),
    ),
    loads: v.array(
      v.object({
        id: v.string(),
        name: v.optional(v.union(v.string(), v.null())),
      }),
    ),
    meta: v.array(
      v.object({
        ref: v.string(),
        status: v.optional(v.union(v.string(), v.null())),
        // Supabase stored this as a JSON string; accept either shape.
        load_ids: v.optional(
          v.union(v.string(), v.array(v.string()), v.null()),
        ),
        load_since: v.optional(v.union(v.string(), v.null())),
      }),
    ),
  },
  handler: async (ctx, { bills, loads, meta }) => {
    let insertedBills = 0;
    let updatedBills = 0;

    for (const b of bills) {
      const ref = b.reference_no.trim();
      if (!ref) continue;
      const last = Number(b.last_month_mepco_reading) || 0;
      const curr = Number(b.manual_reading) || 0;
      const doc = {
        reference_no: ref,
        meter_name: String(b.meter_name ?? "").trim(),
        last_month_mepco_reading: last,
        manual_reading: curr,
        manual_reading_date: b.manual_reading_date ?? null,
        units_consumed: curr - last,
      };
      const existing = await ctx.db
        .query("bills")
        .withIndex("by_reference_no", (q) => q.eq("reference_no", ref))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, doc);
        updatedBills++;
      } else {
        await ctx.db.insert("bills", doc);
        insertedBills++;
      }
    }

    let insertedLoads = 0;
    let updatedLoads = 0;
    for (const l of loads) {
      const loadId = l.id.trim();
      if (!loadId) continue;
      const name = String(l.name ?? "").trim();
      const existing = await ctx.db
        .query("loads")
        .withIndex("by_load_id", (q) => q.eq("load_id", loadId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { name });
        updatedLoads++;
      } else {
        await ctx.db.insert("loads", { load_id: loadId, name });
        insertedLoads++;
      }
    }

    let insertedMeta = 0;
    let updatedMeta = 0;
    for (const m of meta) {
      const ref = m.ref.trim();
      if (!ref) continue;

      let loadIds: string[] = [];
      const raw = m.load_ids;
      if (Array.isArray(raw)) {
        loadIds = raw.filter((x) => typeof x === "string");
      } else if (typeof raw === "string" && raw.length > 0) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            loadIds = parsed.filter((x: unknown) => typeof x === "string");
          }
        } catch {
          loadIds = [];
        }
      }

      const doc = {
        ref,
        status: m.status || "Active",
        load_ids: loadIds,
        load_since: m.load_since ?? null,
      };
      const existing = await ctx.db
        .query("meta")
        .withIndex("by_ref", (q) => q.eq("ref", ref))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, doc);
        updatedMeta++;
      } else {
        await ctx.db.insert("meta", doc);
        insertedMeta++;
      }
    }

    return {
      bills: { inserted: insertedBills, updated: updatedBills },
      loads: { inserted: insertedLoads, updated: updatedLoads },
      meta: { inserted: insertedMeta, updated: updatedMeta },
    };
  },
});
