import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Saleem Electric — Convex schema.
 *
 * Mirrors the three tables the app previously used in Supabase:
 *   bills — one row per meter (the meter register + readings)
 *   loads — distribution loops / feeders
 *   meta  — per-meter status + load assignment
 *
 * `reference_no` (bills) and `ref` (meta) are the human-facing meter reference
 * numbers and act as the logical primary keys, so both are indexed.
 */
export default defineSchema({
  bills: defineTable({
    reference_no: v.string(),
    meter_name: v.string(),
    last_month_mepco_reading: v.number(),
    manual_reading: v.number(),
    manual_reading_date: v.union(v.string(), v.null()),
    units_consumed: v.number(),
  }).index("by_reference_no", ["reference_no"]),

  loads: defineTable({
    // Client-generated stable id (e.g. "load_1731580000000") kept from the
    // Supabase schema so existing meta.load_ids values keep resolving.
    load_id: v.string(),
    name: v.string(),
  }).index("by_load_id", ["load_id"]),

  meta: defineTable({
    ref: v.string(),
    status: v.string(), // "Active" | "Disconnected" | "Defected"
    load_ids: v.array(v.string()),
    load_since: v.union(v.string(), v.null()),
  }).index("by_ref", ["ref"]),
});
