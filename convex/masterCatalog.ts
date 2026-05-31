/**
 * masterCatalog.ts — admin READ over raw `masters` rows.
 *
 * WHY: `masters.bundle` returns only ACTIVE, normalized dropdown options for
 * the survey forms — it deliberately hides inactive rows and drops position/id.
 * The web Masters CRUD screen needs the raw rows (including inactive ones, with
 * `position` and `_id`) to render a sortable, toggleable table.
 *
 * This is a read-only addition; create/update/delete continue to flow through
 * the EXISTING `admin.upsertMaster` / `admin.deleteMaster` mutations. No schema
 * change, no field rename, admin-gated exactly like the mutations.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole, requireUser } from "./helpers";
import { defaultMasterRowsForCategory, resolveMasterCategory } from "./taxationMasters";

export const listByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");
    const storageCategory = resolveMasterCategory(args.category);
    const rows = await ctx.db
      .query("masters")
      .withIndex("by_category_position", (q) => q.eq("category", storageCategory))
      .collect();
    if (rows.length > 0) {
      return rows
        .sort((a, b) => a.position - b.position)
        .map((m) => ({
          _id: m._id,
          category: m.category,
          value: m.value,
          label: m.label,
          position: m.position,
          isActive: m.isActive,
        }));
    }

    // Match `masters.bundle`: show canonical defaults until an admin persists edits.
    return defaultMasterRowsForCategory(storageCategory).map((m) => ({
      category: storageCategory,
      value: m.value,
      label: m.label,
      position: m.position,
      isActive: true,
    }));
  },
});
