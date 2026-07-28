import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** List every meter (previously: supabase.from('bills').select('*')). */
export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("bills").collect(),
});

/**
 * Create or update a meter, keyed on `reference_no`.
 * Replaces the Supabase `bills` upsert.
 */
export const upsert = mutation({
  args: {
    reference_no: v.string(),
    meter_name: v.string(),
    last_month_mepco_reading: v.number(),
    manual_reading: v.number(),
    manual_reading_date: v.union(v.string(), v.null()),
    // Optional: when a meter is renamed to a new reference number the old row
    // (and its meta row) is removed so the reference stays unique.
    previous_reference_no: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const ref = args.reference_no.trim();
    const previous = (args.previous_reference_no ?? "").trim();

    if (previous && previous !== ref) {
      const stale = await ctx.db
        .query("bills")
        .withIndex("by_reference_no", (q) => q.eq("reference_no", previous))
        .collect();
      for (const row of stale) await ctx.db.delete(row._id);

      // Carry the old meta (status / load assignment) over to the new ref.
      const staleMeta = await ctx.db
        .query("meta")
        .withIndex("by_ref", (q) => q.eq("ref", previous))
        .collect();
      for (const row of staleMeta) await ctx.db.patch(row._id, { ref });
    }

    const doc = {
      reference_no: ref,
      meter_name: args.meter_name.trim(),
      last_month_mepco_reading: args.last_month_mepco_reading,
      manual_reading: args.manual_reading,
      manual_reading_date: args.manual_reading_date,
      units_consumed: args.manual_reading - args.last_month_mepco_reading,
    };

    const existing = await ctx.db
      .query("bills")
      .withIndex("by_reference_no", (q) => q.eq("reference_no", ref))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("bills", doc);
  },
});

/** Delete a meter and its meta row (previously two Supabase deletes). */
export const remove = mutation({
  args: { reference_no: v.string() },
  handler: async (ctx, { reference_no }) => {
    const ref = reference_no.trim();

    const bills = await ctx.db
      .query("bills")
      .withIndex("by_reference_no", (q) => q.eq("reference_no", ref))
      .collect();
    for (const row of bills) await ctx.db.delete(row._id);

    const metas = await ctx.db
      .query("meta")
      .withIndex("by_ref", (q) => q.eq("ref", ref))
      .collect();
    for (const row of metas) await ctx.db.delete(row._id);

    return { deleted: bills.length };
  },
});
