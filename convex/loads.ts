import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** List every distribution load / feeder. */
export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("loads").collect(),
});

/** Add a new load. `load_id` is the stable client-side id used by meta rows. */
export const create = mutation({
  args: { load_id: v.string(), name: v.string() },
  handler: async (ctx, { load_id, name }) => {
    const existing = await ctx.db
      .query("loads")
      .withIndex("by_load_id", (q) => q.eq("load_id", load_id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { name: name.trim() });
      return existing._id;
    }
    return await ctx.db.insert("loads", { load_id, name: name.trim() });
  },
});

/**
 * Delete a load and unlink it from every meter that referenced it.
 * (Supabase left dangling ids behind; Convex cleans them up atomically.)
 */
export const remove = mutation({
  args: { load_id: v.string() },
  handler: async (ctx, { load_id }) => {
    const rows = await ctx.db
      .query("loads")
      .withIndex("by_load_id", (q) => q.eq("load_id", load_id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);

    const metas = await ctx.db.query("meta").collect();
    for (const m of metas) {
      if (m.load_ids.includes(load_id)) {
        await ctx.db.patch(m._id, {
          load_ids: m.load_ids.filter((id) => id !== load_id),
        });
      }
    }

    return { deleted: rows.length };
  },
});
