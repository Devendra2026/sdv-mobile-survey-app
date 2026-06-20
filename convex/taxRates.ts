/**
 * Dynamic tax rate configuration per municipality (ULB).
 *
 * Demand notice rate model:
 *   Gross ALV = area × panel rate × 12 × usageMult (commercial ×2, residential ×1)
 *   Assessable ALV = gross ALV × 80%
 *   Property tax = assessable ALV × propertyTaxPct (e.g. 10%)
 *   Water / drainage = total assessable ALV × respective %
 *   Total demand (yearly) = property tax + water + drainage
 */
import { v } from "convex/values";
import { normalizeStoredTaxRates } from "../lib/qc/normalize-tax-rates";
import { DEFAULT_RATE_MATRIX, DEFAULT_TAX_RATES, DEFAULT_USAGE_MULTIPLIERS } from "../lib/qc/tax-rate-defaults";
import { mutation, query } from "./_generated/server";
import { clientError, requireRole, requireUser, writeAudit } from "./helpers";

export { DEFAULT_RATE_MATRIX, DEFAULT_TAX_RATES, DEFAULT_USAGE_MULTIPLIERS };

const rateMatrixValidator = v.record(v.string(), v.record(v.string(), v.number()));

const normalizedTaxRatesValidator = v.object({
  rateMatrix: rateMatrixValidator,
  wardRates: v.record(v.string(), rateMatrixValidator),
  propertyTaxPct: v.number(),
  waterTaxPct: v.number(),
  drainageTaxPct: v.number(),
  usageMultipliers: v.record(v.string(), v.number()),
});

/** Returns the rate config for a ULB, or null (caller should use defaults). */
export const getForMunicipality = query({
  args: { municipalityId: v.id("municipalities") },
  returns: v.union(normalizedTaxRatesValidator, v.null()),
  handler: async (ctx, { municipalityId }) => {
    const doc = await ctx.db
      .query("taxRates")
      .withIndex("by_municipality", (q) => q.eq("municipalityId", municipalityId))
      .unique();

    if (!doc) return null;
    return normalizeStoredTaxRates(doc);
  },
});

/** Admin overview — all municipalities with their rate status. */
export const listAll = query({
  args: {},
  returns: v.array(
    v.object({
      municipality: v.object({
        _id: v.id("municipalities"),
        _creationTime: v.number(),
        name: v.string(),
        code: v.string(),
        bodyType: v.union(v.literal("municipal_council"), v.literal("town_panchayat")),
        districtId: v.id("districts"),
        postalCode: v.optional(v.string()),
        isActive: v.boolean(),
      }),
      rates: v.union(normalizedTaxRatesValidator, v.null()),
    }),
  ),
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const [municipalities, rates] = await Promise.all([
      ctx.db.query("municipalities").collect(),
      ctx.db.query("taxRates").collect(),
    ]);

    const ratesByMuni = new Map(rates.map((r) => [r.municipalityId, r]));

    return municipalities.map((m) => {
      const row = ratesByMuni.get(m._id);
      return {
        municipality: m,
        rates: row ? normalizeStoredTaxRates(row) : null,
      };
    });
  },
});

/** Admin: save one ward's rate matrix (merges into existing ULB config). */
export const saveWard = mutation({
  args: {
    municipalityId: v.id("municipalities"),
    wardNo: v.string(),
    wardRateMatrix: rateMatrixValidator,
    propertyTaxPct: v.number(),
    waterTaxPct: v.number(),
    drainageTaxPct: v.number(),
    usageMultipliers: v.record(v.string(), v.number()),
  },
  returns: v.id("taxRates"),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const muni = await ctx.db.get(args.municipalityId);
    if (!muni) clientError("BAD_REQUEST", "Unknown municipality");

    if (args.propertyTaxPct < 0 || args.propertyTaxPct > 1)
      clientError("BAD_REQUEST", "Property tax must be 0–1 (e.g. 0.10 = 10%)");
    if (args.waterTaxPct < 0 || args.waterTaxPct > 1) clientError("BAD_REQUEST", "Water tax must be 0–1");
    if (args.drainageTaxPct < 0 || args.drainageTaxPct > 1) clientError("BAD_REQUEST", "Drainage tax must be 0–1");

    const existing = await ctx.db
      .query("taxRates")
      .withIndex("by_municipality", (q) => q.eq("municipalityId", args.municipalityId))
      .unique();

    const normalized = existing ? normalizeStoredTaxRates(existing) : null;
    const wardRates = { ...(normalized?.wardRates ?? {}), [args.wardNo.trim()]: args.wardRateMatrix };

    const payload = {
      municipalityId: args.municipalityId,
      rateMatrix: normalized?.rateMatrix ?? DEFAULT_RATE_MATRIX,
      wardRates,
      propertyTaxPct: args.propertyTaxPct,
      waterTaxPct: args.waterTaxPct,
      drainageTaxPct: args.drainageTaxPct,
      usageMultipliers: args.usageMultipliers,
      updatedBy: me._id,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.replace(existing._id, payload);
      await writeAudit(ctx, {
        actorId: me._id,
        action: "taxRates.wardSaved",
        entity: "taxRates",
        entityId: existing._id,
        metadata: { municipalityId: args.municipalityId, wardNo: args.wardNo, municipalityName: muni.name },
      });
      return existing._id;
    }

    const id = await ctx.db.insert("taxRates", payload);
    await writeAudit(ctx, {
      actorId: me._id,
      action: "taxRates.wardSaved",
      entity: "taxRates",
      entityId: id,
      metadata: { municipalityId: args.municipalityId, wardNo: args.wardNo, municipalityName: muni.name },
    });
    return id;
  },
});

/** Admin: set or replace the rate config for a specific municipality. */
export const upsert = mutation({
  args: {
    municipalityId: v.id("municipalities"),
    rateMatrix: rateMatrixValidator,
    wardRates: v.record(v.string(), rateMatrixValidator),
    propertyTaxPct: v.number(),
    waterTaxPct: v.number(),
    drainageTaxPct: v.number(),
    usageMultipliers: v.record(v.string(), v.number()),
  },
  returns: v.id("taxRates"),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const muni = await ctx.db.get(args.municipalityId);
    if (!muni) clientError("BAD_REQUEST", "Unknown municipality");

    if (args.propertyTaxPct < 0 || args.propertyTaxPct > 1)
      clientError("BAD_REQUEST", "Property tax must be 0–1 (e.g. 0.10 = 10%)");
    if (args.waterTaxPct < 0 || args.waterTaxPct > 1) clientError("BAD_REQUEST", "Water tax must be 0–1");
    if (args.drainageTaxPct < 0 || args.drainageTaxPct > 1) clientError("BAD_REQUEST", "Drainage tax must be 0–1");

    const existing = await ctx.db
      .query("taxRates")
      .withIndex("by_municipality", (q) => q.eq("municipalityId", args.municipalityId))
      .unique();

    const payload = {
      municipalityId: args.municipalityId,
      rateMatrix: args.rateMatrix,
      wardRates: args.wardRates,
      propertyTaxPct: args.propertyTaxPct,
      waterTaxPct: args.waterTaxPct,
      drainageTaxPct: args.drainageTaxPct,
      usageMultipliers: args.usageMultipliers,
      updatedBy: me._id,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.replace(existing._id, payload);
      await writeAudit(ctx, {
        actorId: me._id,
        action: "taxRates.updated",
        entity: "taxRates",
        entityId: existing._id,
        metadata: { municipalityId: args.municipalityId, municipalityName: muni.name },
      });
      return existing._id;
    }

    const id = await ctx.db.insert("taxRates", payload);
    await writeAudit(ctx, {
      actorId: me._id,
      action: "taxRates.created",
      entity: "taxRates",
      entityId: id,
      metadata: { municipalityId: args.municipalityId, municipalityName: muni.name },
    });
    return id;
  },
});

/** Admin: rewrite legacy zoneRates rows into the new matrix format. */
export const migrateLegacyRows = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const all = await ctx.db.query("taxRates").collect();
    const toMigrate = all.filter((doc) => !(doc.rateMatrix && doc.wardRates));

    await Promise.all(
      toMigrate.map(async (doc) => {
        const normalized = normalizeStoredTaxRates(doc);
        await ctx.db.replace(doc._id, {
          municipalityId: doc.municipalityId,
          rateMatrix: normalized.rateMatrix,
          wardRates: normalized.wardRates,
          propertyTaxPct: normalized.propertyTaxPct,
          waterTaxPct: normalized.waterTaxPct,
          drainageTaxPct: normalized.drainageTaxPct,
          usageMultipliers: normalized.usageMultipliers,
          updatedBy: me._id,
          updatedAt: Date.now(),
        });
      }),
    );

    return toMigrate.length;
  },
});

/** Admin: delete custom config so system defaults apply again. */
export const resetToDefaults = mutation({
  args: { municipalityId: v.id("municipalities") },
  returns: v.null(),
  handler: async (ctx, { municipalityId }) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const existing = await ctx.db
      .query("taxRates")
      .withIndex("by_municipality", (q) => q.eq("municipalityId", municipalityId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      await writeAudit(ctx, {
        actorId: me._id,
        action: "taxRates.reset",
        entity: "taxRates",
        entityId: existing._id,
        metadata: { municipalityId },
      });
    }

    return null;
  },
});
