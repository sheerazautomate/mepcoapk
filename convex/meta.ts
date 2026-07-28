import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

/** List per-meter metadata (status + load assignment). */
export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("meta").collect(),
});

/** Insert-or-patch the single meta row for `ref`, defaulting missing fields. */
async function upsertMeta(
  ctx: MutationCtx,
  ref: string,
  patch: Partial<Omit<Doc<"meta">, "_id" | "_creationTime">>,
) {
  const existing = await ctx.db
    .query("meta")
    .withIndex("by_ref", (q) => q.eq("ref", ref))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }
  return await ctx.db.insert("meta", {
    ref,
    status: "Active",
    load_ids: [],
    load_since: null,
    ...patch,
  });
}

/** Assign a set of loads to a meter (replaces the Supabase `meta` upsert). */
export const setLoads = mutation({
  args: {
    ref: v.string(),
    load_ids: v.array(v.string()),
    load_since: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { ref, load_ids, load_since }) =>
    await upsertMeta(ctx, ref.trim(), { load_ids, load_since }),
});

/** Update just the connection status of a meter. */
export const setStatus = mutation({
  args: { ref: v.string(), status: v.string() },
  handler: async (ctx, { ref, status }) =>
    await upsertMeta(ctx, ref.trim(), { status }),
});
