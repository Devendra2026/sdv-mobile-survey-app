/**
 * Tenant hierarchy — districts → ULBs (municipalities) → wards.
 *
 * Multitenant isolation:
 *   - admin: all active districts / ULBs
 *   - districtId on user: all ULBs in that district
 *   - municipalityId on user: single ULB (+ its district for display)
 *   - surveyor ward checks remain in helpers.assertCanReadWard
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { seedAreaMasters } from "./areaMasters";
import { clientError, requireRole, requireUser, writeAudit } from "./helpers";
import { seedSystemRbac } from "./rbac";
import { ulbBodyType } from "./schema";
import { seedServiceMasters } from "./serviceMasters";
import { seedTaxationMasters } from "./taxationMasters";

export { resolveTenantScope } from "./tenancy";

/** Admin inbox — full tenant tree for setup screens. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const [districts, municipalities, wards] = await Promise.all([
      ctx.db.query("districts").collect(),
      ctx.db.query("municipalities").collect(),
      ctx.db.query("wards").collect(),
    ]);

    return districts
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({
        ...d,
        ulbs: municipalities
          .filter((m) => m.districtId === d._id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((m) => ({
            ...m,
            wards: wards
              .filter((w) => w.municipalityId === m._id)
              .sort((a, b) => a.wardNo.localeCompare(b.wardNo, undefined, { numeric: true })),
          })),
      }));
  },
});

export const upsertDistrict = mutation({
  args: {
    id: v.optional(v.id("districts")),
    code: v.string(),
    name: v.string(),
    stateName: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const code = args.code.trim().toUpperCase();
    if (!code) clientError("BAD_REQUEST", "District code is required");

    const dup = await ctx.db
      .query("districts")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (dup && dup._id !== args.id) {
      clientError("BAD_REQUEST", "District code already exists");
    }

    if (args.id) {
      await ctx.db.patch(args.id, {
        code,
        name: args.name.trim(),
        stateName: args.stateName.trim(),
        isActive: args.isActive,
      });
      await writeAudit(ctx, {
        actorId: me._id,
        action: "district.updated",
        entity: "district",
        entityId: args.id,
      });
      return args.id;
    }

    const id = await ctx.db.insert("districts", {
      code,
      name: args.name.trim(),
      stateName: args.stateName.trim(),
      isActive: args.isActive,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "district.created",
      entity: "district",
      entityId: id,
    });
    return id;
  },
});

export const upsertMunicipality = mutation({
  args: {
    id: v.optional(v.id("municipalities")),
    districtId: v.id("districts"),
    code: v.string(),
    name: v.string(),
    bodyType: ulbBodyType,
    postalCode: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const district = await ctx.db.get(args.districtId);
    if (!district) clientError("BAD_REQUEST", "Unknown district");

    const code = args.code.trim().toUpperCase();
    if (!code) clientError("BAD_REQUEST", "ULB code is required");

    const postalCode = args.postalCode?.replace(/\D/g, "").slice(0, 6);
    if (postalCode && !/^[1-9]\d{5}$/.test(postalCode)) {
      clientError("BAD_REQUEST", "Postal code must be 6 digits, not starting with 0");
    }
    if (!args.id && !postalCode) {
      clientError("BAD_REQUEST", "PIN code is required for each ULB");
    }

    const dup = await ctx.db
      .query("municipalities")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (dup && dup._id !== args.id) {
      clientError("BAD_REQUEST", "ULB code already exists");
    }

    const row: {
      districtId: Id<"districts">;
      code: string;
      name: string;
      bodyType: (typeof args)["bodyType"];
      isActive: boolean;
      postalCode?: string;
    } = {
      districtId: args.districtId,
      code,
      name: args.name.trim(),
      bodyType: args.bodyType,
      isActive: args.isActive,
    };
    if (postalCode) {
      row.postalCode = postalCode;
    }

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) clientError("BAD_REQUEST", "Unknown municipality");
      if (!row.postalCode && !existing.postalCode) {
        clientError("BAD_REQUEST", "PIN code is required for each ULB");
      }
      await ctx.db.patch(args.id, row);
      await writeAudit(ctx, {
        actorId: me._id,
        action: "municipality.updated",
        entity: "municipality",
        entityId: args.id,
      });
      return args.id;
    }

    const id = await ctx.db.insert("municipalities", row);
    await writeAudit(ctx, {
      actorId: me._id,
      action: "municipality.created",
      entity: "municipality",
      entityId: id,
    });
    return id;
  },
});

export const upsertWard = mutation({
  args: {
    id: v.optional(v.id("wards")),
    municipalityId: v.id("municipalities"),
    wardNo: v.string(),
    wardCode: v.optional(v.string()),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const muni = await ctx.db.get(args.municipalityId);
    if (!muni) clientError("BAD_REQUEST", "Unknown municipality");

    const wardNo = args.wardNo.trim();
    const name = args.name.trim();
    if (!wardNo) clientError("BAD_REQUEST", "Ward number is required");
    if (!name) clientError("BAD_REQUEST", "Ward name is required");

    const wardCodeInput = (args.wardCode ?? "").trim().toUpperCase();
    const wardCode = wardCodeInput || `${muni.code}-W${wardNo}`.toUpperCase();

    const dupNo = await ctx.db
      .query("wards")
      .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", args.municipalityId).eq("wardNo", wardNo))
      .unique();
    if (dupNo && dupNo._id !== args.id) {
      clientError("BAD_REQUEST", "Ward number already exists for this ULB");
    }

    const dupCode = await ctx.db
      .query("wards")
      .withIndex("by_municipality_ward_code", (q) =>
        q.eq("municipalityId", args.municipalityId).eq("wardCode", wardCode),
      )
      .unique();
    if (dupCode && dupCode._id !== args.id) {
      clientError("BAD_REQUEST", "Ward code already exists for this ULB");
    }

    const row = { wardNo, wardCode, name };

    if (args.id) {
      await ctx.db.patch(args.id, row);
      await writeAudit(ctx, {
        actorId: me._id,
        action: "ward.updated",
        entity: "ward",
        entityId: args.id,
      });
      return args.id;
    }

    const id = await ctx.db.insert("wards", {
      municipalityId: args.municipalityId,
      ...row,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "ward.created",
      entity: "ward",
      entityId: id,
      metadata: { municipalityId: args.municipalityId, wardCode },
    });
    return id;
  },
});

/** Assessment years for admin tenant setup (global masters, category assessment_year). */
export const listAssessmentYears = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const rows = await ctx.db
      .query("masters")
      .withIndex("by_category_position", (q) => q.eq("category", "assessment_year").eq("isActive", true))
      .collect();

    return rows
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ _id: m._id, value: m.value, label: m.label, position: m.position, isActive: m.isActive }));
  },
});

export const upsertAssessmentYear = mutation({
  args: {
    value: v.string(),
    label: v.string(),
    position: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const value = args.value.trim();
    const label = args.label.trim();
    if (!value) clientError("BAD_REQUEST", "Assessment year value is required");
    if (!label) clientError("BAD_REQUEST", "Assessment year label is required");

    const [existing, activeYears] = await Promise.all([
      ctx.db
        .query("masters")
        .withIndex("by_category_value", (q) => q.eq("category", "assessment_year").eq("value", value))
        .unique(),
      ctx.db
        .query("masters")
        .withIndex("by_category_position", (q) => q.eq("category", "assessment_year").eq("isActive", true))
        .collect(),
    ]);
    const position =
      args.position ?? (activeYears.length > 0 ? Math.max(...activeYears.map((r) => r.position)) + 1 : 1);
    const isActive = args.isActive ?? true;

    if (existing) {
      await ctx.db.patch(existing._id, { label, position, isActive });
      return existing._id;
    }

    const id = await ctx.db.insert("masters", {
      category: "assessment_year",
      value,
      label,
      position,
      isActive,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "master.assessment_year.created",
      entity: "masters",
      entityId: id,
      metadata: { value },
    });
    return id;
  },
});

/** Idempotent seed / refresh for dev and admin setup (UP districts + sample ULBs). */
export const seedReferenceData = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const assessmentYears = [
      { value: "2025-26", label: "2025-26", position: 1 },
      { value: "2026-27", label: "2026-27", position: 2 },
    ];
    await Promise.all(
      assessmentYears.map(async (y) => {
        const row = await ctx.db
          .query("masters")
          .withIndex("by_category_value", (q) => q.eq("category", "assessment_year").eq("value", y.value))
          .unique();
        if (row) {
          await ctx.db.patch(row._id, { label: y.label, position: y.position, isActive: true });
        } else {
          await ctx.db.insert("masters", {
            category: "assessment_year",
            value: y.value,
            label: y.label,
            position: y.position,
            isActive: true,
          });
        }
      }),
    );

    type UlbSeed = {
      code: string;
      name: string;
      bodyType: "municipal_council" | "town_panchayat";
      postalCode: string;
      wards: Array<{ wardNo: string; wardCode: string; name: string }>;
    };

    const districtSeeds: Array<{
      code: string;
      name: string;
      ulbs: UlbSeed[];
    }> = [
      {
        code: "MTH",
        name: "Mathura",
        ulbs: [
          {
            code: "MTH-MC-001",
            name: "Mathura Municipal Corporation",
            bodyType: "municipal_council",
            postalCode: "281001",
            wards: [
              { wardNo: "1", wardCode: "MTH-W01", name: "Krishna Nagar" },
              { wardNo: "2", wardCode: "MTH-W02", name: "Janambhumi" },
            ],
          },
          {
            code: "MTH-TP-VRINDAVAN",
            name: "Vrindavan Town Panchayat",
            bodyType: "town_panchayat",
            postalCode: "281121",
            wards: [{ wardNo: "1", wardCode: "MTH-VRI-W01", name: "Vrindavan" }],
          },
        ],
      },
      {
        code: "HTR",
        name: "Hathras",
        ulbs: [
          {
            code: "HTR-MC-001",
            name: "Hathras Municipal Council",
            bodyType: "municipal_council",
            postalCode: "204101",
            wards: [
              { wardNo: "1", wardCode: "HTR-W01", name: "Sadar" },
              { wardNo: "2", wardCode: "HTR-W02", name: "Mendu" },
            ],
          },
          {
            code: "HTR-TP-SASNI",
            name: "Sasni Town Panchayat",
            bodyType: "town_panchayat",
            postalCode: "204216",
            wards: [{ wardNo: "1", wardCode: "HTR-SAS-W01", name: "Sasni" }],
          },
        ],
      },
      {
        code: "AGR",
        name: "Agra",
        ulbs: [
          {
            code: "AGR-MC-001",
            name: "Agra Municipal Corporation",
            bodyType: "municipal_council",
            postalCode: "282001",
            wards: [
              { wardNo: "1", wardCode: "AGR-W01", name: "Tajganj" },
              { wardNo: "2", wardCode: "AGR-W02", name: "Sadar" },
            ],
          },
          {
            code: "AGR-TP-FATEHABAD",
            name: "Fatehabad Town Panchayat",
            bodyType: "town_panchayat",
            postalCode: "283111",
            wards: [{ wardNo: "1", wardCode: "AGR-FTH-W01", name: "Fatehabad" }],
          },
        ],
      },
      {
        code: "ETA",
        name: "Etah",
        ulbs: [
          {
            code: "ETA-MC-001",
            name: "Etah Municipal Council",
            bodyType: "municipal_council",
            postalCode: "207001",
            wards: [
              { wardNo: "1", wardCode: "ETA-W01", name: "Kotwali" },
              { wardNo: "2", wardCode: "ETA-W02", name: "Station Road" },
            ],
          },
          {
            code: "ETA-TP-JALESAR",
            name: "Jalesar Town Panchayat",
            bodyType: "town_panchayat",
            postalCode: "207302",
            wards: [{ wardNo: "1", wardCode: "ETA-JAL-W01", name: "Jalesar" }],
          },
        ],
      },
      {
        code: "BAG",
        name: "Baghpat",
        ulbs: [
          {
            code: "BAG-MC-001",
            name: "Baghpat Municipal Council",
            bodyType: "municipal_council",
            postalCode: "250609",
            wards: [{ wardNo: "1", wardCode: "BAG-W01", name: "Main" }],
          },
          {
            code: "BAG-TP-BARAUT",
            name: "Baraut Town Panchayat",
            bodyType: "town_panchayat",
            postalCode: "250611",
            wards: [{ wardNo: "1", wardCode: "BAG-BRT-W01", name: "Baraut" }],
          },
        ],
      },
      {
        code: "MAIN",
        name: "Mainpuri",
        ulbs: [
          {
            code: "MAIN-MC-001",
            name: "Mainpuri Municipal Council",
            bodyType: "municipal_council",
            postalCode: "205001",
            wards: [
              { wardNo: "1", wardCode: "MAIN-W01", name: "Civil Lines" },
              { wardNo: "2", wardCode: "MAIN-W02", name: "Railway Colony" },
            ],
          },
          {
            code: "MAIN-TP-BHONGAON",
            name: "Bhongaon Town Panchayat",
            bodyType: "town_panchayat",
            postalCode: "205262",
            wards: [{ wardNo: "1", wardCode: "MAIN-BHO-W01", name: "Bhongaon" }],
          },
        ],
      },
      {
        code: "KAS",
        name: "Kasganj",
        ulbs: [
          {
            code: "KAS-MC-001",
            name: "Kasganj Municipal Council",
            bodyType: "municipal_council",
            postalCode: "207123",
            wards: [{ wardNo: "1", wardCode: "KAS-W01", name: "Sadar" }],
          },
          {
            code: "KAS-TP-SORON",
            name: "Soron Town Panchayat",
            bodyType: "town_panchayat",
            postalCode: "207403",
            wards: [{ wardNo: "1", wardCode: "KAS-SOR-W01", name: "Soron" }],
          },
        ],
      },
    ];

    for (const d of districtSeeds) {
      let districtId: Id<"districts">;
      const existingDistrict = await ctx.db
        .query("districts")
        .withIndex("by_code", (q) => q.eq("code", d.code))
        .unique();

      if (existingDistrict) {
        districtId = existingDistrict._id;
        await ctx.db.patch(districtId, {
          name: d.name,
          stateName: "Uttar Pradesh",
          isActive: true,
        });
      } else {
        districtId = await ctx.db.insert("districts", {
          code: d.code,
          name: d.name,
          stateName: "Uttar Pradesh",
          isActive: true,
        });
      }

      for (const u of d.ulbs) {
        let muniId: Id<"municipalities">;
        const existingMuni = await ctx.db
          .query("municipalities")
          .withIndex("by_code", (q) => q.eq("code", u.code))
          .unique();

        if (existingMuni) {
          muniId = existingMuni._id;
          await ctx.db.patch(muniId, {
            districtId,
            name: u.name,
            bodyType: u.bodyType,
            postalCode: u.postalCode,
            isActive: true,
          });
        } else {
          muniId = await ctx.db.insert("municipalities", {
            code: u.code,
            name: u.name,
            bodyType: u.bodyType,
            districtId,
            postalCode: u.postalCode,
            isActive: true,
          });
        }

        await Promise.all(
          u.wards.map(async (w) => {
            const existingWard = await ctx.db
              .query("wards")
              .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", muniId).eq("wardNo", w.wardNo))
              .unique();
            if (existingWard) {
              await ctx.db.patch(existingWard._id, { name: w.name, wardCode: w.wardCode });
            } else {
              await ctx.db.insert("wards", {
                municipalityId: muniId,
                wardNo: w.wardNo,
                wardCode: w.wardCode,
                name: w.name,
              });
            }
          }),
        );
      }
    }

    await Promise.all([seedSystemRbac(ctx), seedTaxationMasters(ctx), seedAreaMasters(ctx), seedServiceMasters(ctx)]);

    await writeAudit(ctx, {
      actorId: me._id,
      action: "tenants.seeded",
      entity: "tenants",
      metadata: { districts: districtSeeds.length },
    });

    return { ok: true as const };
  },
});
