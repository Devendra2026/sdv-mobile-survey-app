import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { addressTenantContext, normalizeAddressFields, validateAddressSection } from "./addressRules";
import { presentFloorRow, validateAreaSection } from "./areaMasters";
import { GPS_ACCEPT_MAX_ACCURACY_METERS, GPS_TARGET_ACCURACY_METERS } from "./gpsAccuracy";
import { assertCanReadWard, clientError, requireRole, requireUser, writeAudit } from "./helpers";
import { isValidIndianOwnerMobile, normalizeOwners, primaryOwnerMobile, validateOwnerSection } from "./ownerRules";
import { gpsCapture, qcStatus, sanitationType, surveyOwnerEntry, surveyStatus, waterSource } from "./schema";
import { validateServicesSection } from "./serviceMasters";
import { validateTaxationSection } from "./taxationMasters";
import { assertMunicipalityInScope, resolveTenantScope, tenantDistrictIds, tenantMunicipalityIds } from "./tenancy";

/* ────────────────────────── shared input validator ────────────────────────── */

/** Partial payload for in-progress saves — only `localId` + `municipalityId` are required. */
const draftSurveyInput = {
  localId: v.string(),
  municipalityId: v.id("municipalities"),
  clientUpdatedAt: v.number(),
  wardNo: v.optional(v.string()),
  sectorNo: v.optional(v.string()),
  oldPropertyNo: v.optional(v.string()),
  propertyId: v.optional(v.string()),
  parcelNo: v.optional(v.string()),
  unitNo: v.optional(v.string()),
  constructedYear: v.optional(v.number()),
  isSlum: v.optional(v.boolean()),
  respondentName: v.optional(v.string()),
  relationship: v.optional(v.string()),
  owners: v.optional(v.array(surveyOwnerEntry)),
  familySize: v.optional(v.number()),
  mobileNo: v.optional(v.string()),
  altMobileNo: v.optional(v.string()),
  houseNo: v.optional(v.string()),
  locality: v.optional(v.string()),
  colonyName: v.optional(v.string()),
  pinCode: v.optional(v.string()),
  city: v.optional(v.string()),
  street: v.optional(v.string()),
  assessmentYear: v.optional(v.string()),
  ownershipType: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  propertyUse: v.optional(v.string()),
  situation: v.optional(v.string()),
  roadType: v.optional(v.string()),
  taxRateZone: v.optional(v.string()),
  plotSqft: v.optional(v.number()),
  plinthSqft: v.optional(v.number()),
  municipalWaterConnection: v.optional(v.boolean()),
  waterSource: v.optional(waterSource),
  sanitationType: v.optional(sanitationType),
  municipalWasteCollection: v.optional(v.boolean()),
  electricityNo: v.optional(v.string()),
  gps: v.optional(gpsCapture),
};

const surveyInput = {
  localId: v.string(),
  municipalityId: v.id("municipalities"),
  wardNo: v.string(),

  sectorNo: v.optional(v.string()),
  oldPropertyNo: v.optional(v.string()),
  propertyId: v.optional(v.string()),
  parcelNo: v.string(),
  unitNo: v.string(),
  constructedYear: v.optional(v.number()),
  isSlum: v.boolean(),

  respondentName: v.optional(v.string()),
  relationship: v.optional(v.string()),
  owners: v.optional(v.array(surveyOwnerEntry)),
  familySize: v.optional(v.number()),
  mobileNo: v.string(),
  altMobileNo: v.optional(v.string()),

  houseNo: v.optional(v.string()),
  locality: v.string(),
  colonyName: v.optional(v.string()),
  pinCode: v.string(),
  city: v.optional(v.string()),
  /** @deprecated — mapped to colonyName on upsert */
  street: v.optional(v.string()),

  assessmentYear: v.string(),
  ownershipType: v.string(),
  propertyType: v.string(),
  propertyUse: v.string(),
  situation: v.string(),
  roadType: v.string(),
  taxRateZone: v.string(),
  plotSqft: v.number(),
  plinthSqft: v.number(),

  municipalWaterConnection: v.boolean(),
  waterSource,
  sanitationType,
  municipalWasteCollection: v.boolean(),
  electricityNo: v.optional(v.string()),

  gps: v.optional(gpsCapture),
  clientUpdatedAt: v.number(),
};

/* ────────────────────────── reactive queries ────────────────────────── */

/**
 * Tenant-filtered list. The mobile app subscribes to this with `useQuery`
 * — Convex pushes updates automatically when any matching row changes,
 * so there's no need for a manual refetch on the surveyor's device.
 */
export const list = query({
  args: {
    status: v.optional(surveyStatus),
    qcStatus: v.optional(qcStatus),
    wardNo: v.optional(v.string()),
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
    surveyorId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const limit = Math.min(args.limit ?? 50, 200);

    // Choose the cheapest index. Surveyors hit the by_surveyor index;
    // supervisors/admins use municipality-level indexes.
    const scope = await resolveTenantScope(ctx, me);
    const districtIds = tenantDistrictIds(scope);
    const muniIds = tenantMunicipalityIds(scope);

    if (args.municipalityId) {
      await assertMunicipalityInScope(ctx, me, args.municipalityId);
    }
    if (args.districtId && me.role !== "admin" && !districtIds.has(args.districtId)) {
      clientError("FORBIDDEN", "This district is outside your assigned scope");
    }

    let rows: Doc<"surveys">[];
    if (me.role === "surveyor") {
      rows = await ctx.db
        .query("surveys")
        .withIndex("by_surveyor", (q) => q.eq("surveyorId", me._id))
        .order("desc")
        .take(limit * 2);
      rows = rows.filter((r) => !r.districtId || districtIds.has(r.districtId)).slice(0, limit);
    } else if (me.role === "supervisor") {
      const districtKey = args.districtId ?? (scope.districts.length === 1 ? scope.districts[0]!._id : undefined);
      const muniKey = args.municipalityId ?? me.municipalityId;

      if (muniKey) {
        rows = await ctx.db
          .query("surveys")
          .withIndex("by_municipality_status", (q) =>
            args.status ? q.eq("municipalityId", muniKey).eq("status", args.status) : q.eq("municipalityId", muniKey),
          )
          .order("desc")
          .take(limit * 2);
      } else if (districtKey) {
        rows = await ctx.db
          .query("surveys")
          .withIndex("by_district_status", (q) =>
            args.status ? q.eq("districtId", districtKey).eq("status", args.status) : q.eq("districtId", districtKey),
          )
          .order("desc")
          .take(limit * 2);
      } else {
        return [];
      }
      rows = rows.slice(0, limit);
    } else if (me.role === "admin") {
      if (args.municipalityId) {
        rows = await ctx.db
          .query("surveys")
          .withIndex("by_municipality_status", (q) =>
            args.status
              ? q.eq("municipalityId", args.municipalityId!).eq("status", args.status)
              : q.eq("municipalityId", args.municipalityId!),
          )
          .order("desc")
          .take(limit * 2);
      } else if (args.districtId) {
        rows = await ctx.db
          .query("surveys")
          .withIndex("by_district_status", (q) =>
            args.status
              ? q.eq("districtId", args.districtId!).eq("status", args.status)
              : q.eq("districtId", args.districtId!),
          )
          .order("desc")
          .take(limit * 2);
      } else if (args.surveyorId) {
        rows = await ctx.db
          .query("surveys")
          .withIndex("by_surveyor", (q) => q.eq("surveyorId", args.surveyorId!))
          .order("desc")
          .take(limit * 2);
      } else {
        rows = await ctx.db
          .query("surveys")
          .order("desc")
          .take(limit * 2);
      }
      rows = rows.slice(0, limit);
    } else {
      rows = [];
    }

    rows = rows.filter((r) => muniIds.has(r.municipalityId));

    // Apply remaining filters in memory — they're small once the index has narrowed.
    if (args.districtId) {
      rows = rows.filter((r) => r.districtId === args.districtId);
    }
    if (args.municipalityId) {
      rows = rows.filter((r) => r.municipalityId === args.municipalityId);
    }
    if (args.surveyorId) {
      rows = rows.filter((r) => r.surveyorId === args.surveyorId);
    }
    if (args.status && me.role !== "supervisor") {
      rows = rows.filter((r) => r.status === args.status);
    }
    if (args.qcStatus) {
      rows = rows.filter((r) => r.qcStatus === args.qcStatus);
    }
    if (args.wardNo) {
      rows = rows.filter((r) => r.wardNo === args.wardNo);
    }
    return rows;
  },
});

/** Single survey with floors + photos + QC remarks hydrated for the detail screen. */
export const get = query({
  args: { id: v.id("surveys") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.id);
    if (!survey) return null;
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);

    const [floors, photos, qcRemarks, surveyor] = await Promise.all([
      ctx.db
        .query("floors")
        .withIndex("by_survey", (q) => q.eq("surveyId", args.id))
        .collect()
        .then((rows) => rows.sort((a, b) => a.position - b.position).map(presentFloorRow)),
      ctx.db
        .query("photos")
        .withIndex("by_survey", (q) => q.eq("surveyId", args.id))
        .collect(),
      ctx.db
        .query("qcRemarks")
        .withIndex("by_survey", (q) => q.eq("surveyId", args.id))
        .order("desc")
        .collect(),
      ctx.db.get(survey.surveyorId),
    ]);

    // Hydrate photo URLs from Convex storage so the client can display them directly.
    const hydratedPhotos = await Promise.all(
      photos.map(async (p) => ({
        ...p,
        url: await ctx.storage.getUrl(p.storageId),
      })),
    );

    const muni = await ctx.db.get(survey.municipalityId);

    return {
      ...survey,
      districtId: muni?.districtId ?? survey.districtId,
      floors,
      photos: hydratedPhotos,
      qcRemarks,
      surveyor: surveyor ? { _id: surveyor._id, name: surveyor.name } : null,
    };
  },
});

export const getByLocalId = query({
  args: { localId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db
      .query("surveys")
      .withIndex("by_surveyor_localId", (q) => q.eq("surveyorId", me._id).eq("localId", args.localId))
      .unique();
  },
});

/* ────────────────────────── mutations ────────────────────────── */

const DRAFT_SURVEY_DEFAULTS = {
  wardNo: "",
  parcelNo: "",
  unitNo: "",
  mobileNo: "",
  locality: "",
  colonyName: "",
  city: "",
  pinCode: "",
  assessmentYear: "",
  ownershipType: "",
  propertyType: "",
  propertyUse: "",
  situation: "",
  roadType: "",
  taxRateZone: "",
  plotSqft: 0,
  plinthSqft: 0,
  isSlum: false,
  municipalWaterConnection: false,
  waterSource: "government_tap" as const,
  sanitationType: "sewer_system" as const,
  municipalWasteCollection: false,
};

/**
 * Save in-progress survey data without requiring every step to be complete.
 * Full business rules (PIN vs ULB, owner mobile, taxation, etc.) run on
 * `submit` instead.
 */
export const saveDraft = mutation({
  args: draftSurveyInput,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "surveyor", "supervisor", "admin");
    const muni = await assertMunicipalityInScope(ctx, me, args.municipalityId);

    const existing = await ctx.db
      .query("surveys")
      .withIndex("by_surveyor_localId", (q) => q.eq("surveyorId", me._id).eq("localId", args.localId))
      .unique();

    if (existing?.qcStatus === "approved" && me.role === "surveyor") {
      clientError("LOCKED", "This survey is locked — request your supervisor to re-open it");
    }

    const wardNo = args.wardNo?.trim() ?? existing?.wardNo ?? "";
    if (wardNo) {
      assertCanReadWard(me, args.municipalityId, wardNo);
      const ward = await ctx.db
        .query("wards")
        .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", args.municipalityId).eq("wardNo", wardNo))
        .unique();
      if (!ward) clientError("BAD_REQUEST", "Unknown ward", { wardNo: ["unknown ward"] });
    }

    const district = await ctx.db.get(muni.districtId);
    const addressCtx = {
      ...addressTenantContext(muni, district),
      configuredPostalCode: muni.postalCode,
    };

    const merged = mergeDraftArgs(existing, args, muni);
    const normalized = normalizeAddressFields(normalizeOwnerFields(normalizePropertyFields(merged)), muni);
    validateBusinessRules(normalized, addressCtx, "draft");

    const writable = { ...stripLocalId(normalized as SurveyUpsertArgs), districtId: muni.districtId };

    if (existing) {
      const newStatus: Doc<"surveys">["status"] = existing.status === "draft" ? "draft" : existing.status;
      const newQcStatus: Doc<"surveys">["qcStatus"] = existing.qcStatus === "approved" ? "pending" : existing.qcStatus;

      await ctx.db.patch(existing._id, {
        ...writable,
        status: newStatus,
        qcStatus: newQcStatus,
        serverVersion: existing.serverVersion + 1,
        clientUpdatedAt: args.clientUpdatedAt,
      });
      await writeAudit(ctx, {
        actorId: me._id,
        action: "survey.draft_saved",
        entity: "survey",
        entityId: existing._id,
      });
      return existing._id;
    }

    const newId = await ctx.db.insert("surveys", {
      ...writable,
      surveyorId: me._id,
      localId: args.localId,
      status: "draft",
      qcStatus: "pending",
      serverVersion: 1,
      clientUpdatedAt: args.clientUpdatedAt,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "survey.created",
      entity: "survey",
      entityId: newId,
      metadata: { localId: args.localId, draft: true },
    });
    return newId;
  },
});

/**
 * Idempotent upsert with full validation. Prefer `saveDraft` while filling
 * the wizard; use this path only when every required field is present.
 *
 * On every write `serverVersion` increments so the client can detect
 * stale-cache conditions.
 */
export const upsert = mutation({
  args: surveyInput,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "surveyor", "supervisor", "admin");
    const muni = await assertMunicipalityInScope(ctx, me, args.municipalityId);
    assertCanReadWard(me, args.municipalityId, args.wardNo);

    const district = await ctx.db.get(muni.districtId);
    const addressCtx = {
      ...addressTenantContext(muni, district),
      configuredPostalCode: muni.postalCode,
    };
    const normalized = normalizeAddressFields(normalizeOwnerFields(normalizePropertyFields(args)), muni);
    validateBusinessRules(normalized, addressCtx, "submit");

    // Confirm ward exists within the municipality
    const ward = await ctx.db
      .query("wards")
      .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", args.municipalityId).eq("wardNo", args.wardNo))
      .unique();
    if (!ward) clientError("BAD_REQUEST", "Unknown ward", { wardNo: ["unknown ward"] });

    const existing = await ctx.db
      .query("surveys")
      .withIndex("by_surveyor_localId", (q) => q.eq("surveyorId", me._id).eq("localId", args.localId))
      .unique();

    const now = Date.now();
    const writable = { ...stripLocalId(normalized), districtId: muni.districtId };

    if (existing) {
      // If the supervisor already approved this row, lock further edits unless
      // it's the supervisor/admin doing the edit (which re-opens QC).
      if (existing.qcStatus === "approved" && me.role === "surveyor") {
        clientError("LOCKED", "This survey is locked — request your supervisor to re-open it");
      }

      const newStatus: Doc<"surveys">["status"] = existing.status === "draft" ? "draft" : existing.status;
      const newQcStatus: Doc<"surveys">["qcStatus"] = existing.qcStatus === "approved" ? "pending" : existing.qcStatus;

      await ctx.db.patch(existing._id, {
        ...writable,
        status: newStatus,
        qcStatus: newQcStatus,
        serverVersion: existing.serverVersion + 1,
      });
      await writeAudit(ctx, {
        actorId: me._id,
        action: "survey.updated",
        entity: "survey",
        entityId: existing._id,
      });
      return existing._id;
    }

    const newId = await ctx.db.insert("surveys", {
      ...writable,
      surveyorId: me._id,
      localId: args.localId,
      status: "draft",
      qcStatus: "pending",
      serverVersion: 1,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "survey.created",
      entity: "survey",
      entityId: newId,
      metadata: { localId: args.localId },
    });
    return newId;
  },
});

/** Attach or refresh GPS on a draft survey before submit. */
export const setGps = mutation({
  args: { id: v.id("surveys"), gps: gpsCapture },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.id);
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    if (survey.surveyorId !== me._id && me.role === "surveyor") {
      clientError("FORBIDDEN", "Not your survey");
    }
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === "approved" && me.role === "surveyor") {
      clientError("LOCKED", "Survey is locked");
    }
    if (args.gps.accuracyMeters > GPS_ACCEPT_MAX_ACCURACY_METERS) {
      clientError("VALIDATION", `GPS must be within ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m — retake outside`, {
        gps: [`GPS must be within ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m — retake in open sky`],
      });
    }
    await ctx.db.patch(args.id, {
      gps: args.gps,
      serverVersion: survey.serverVersion + 1,
    });
  },
});

/**
 * Transitions a draft to `submitted`. Requires at least one floor and
 * both required photos (front + side).
 */
export const submit = mutation({
  args: { id: v.id("surveys") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.id);
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    if (survey.surveyorId !== me._id && me.role === "surveyor") {
      clientError("FORBIDDEN", "Not your survey");
    }
    if (survey.status !== "draft" && survey.status !== "rejected") {
      clientError("BAD_STATE", "Only drafts can be submitted");
    }
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);

    const floors = await ctx.db
      .query("floors")
      .withIndex("by_survey", (q) => q.eq("surveyId", args.id))
      .collect();
    const areaErrors = validateAreaSection({
      plotSqft: survey.plotSqft,
      plinthSqft: survey.plinthSqft,
      floorAreasSqft: floors.map((f) => f.areaSqft),
    });
    if (Object.keys(areaErrors).length > 0) {
      clientError("VALIDATION", "Area details incomplete", areaErrors);
    }

    const photos = await ctx.db
      .query("photos")
      .withIndex("by_survey", (q) => q.eq("surveyId", args.id))
      .collect();
    const slots = new Set(photos.map((p) => p.slot));
    const missing: string[] = [];
    if (!slots.has("front")) missing.push("front photo required");
    if (!slots.has("side")) missing.push("side photo required");
    if (missing.length > 0) {
      clientError("VALIDATION", "Required photos missing", { photos: missing });
    }
    if (!survey.gps) {
      clientError("VALIDATION", "GPS capture required", { gps: ["capture GPS first"] });
    }

    const muni = await ctx.db.get(survey.municipalityId);
    if (!muni) clientError("NOT_FOUND", "Municipality not found");
    const district = await ctx.db.get(muni.districtId);
    const addressCtx = {
      ...addressTenantContext(muni, district),
      configuredPostalCode: muni.postalCode,
    };
    validateBusinessRules(survey as unknown as Record<string, unknown>, addressCtx, "submit");

    await ctx.db.patch(args.id, {
      status: "submitted",
      qcStatus: survey.qcStatus === "rejected" ? "pending" : survey.qcStatus,
      submittedAt: Date.now(),
      serverVersion: survey.serverVersion + 1,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "survey.submitted",
      entity: "survey",
      entityId: args.id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("surveys") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.id);
    if (!survey) return;
    if (survey.surveyorId !== me._id && me.role !== "admin") {
      clientError("FORBIDDEN", "Not your survey");
    }
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    if (survey.qcStatus === "approved") {
      clientError("LOCKED", "Cannot delete an approved survey");
    }

    // Cascade delete child rows.
    for await (const f of ctx.db.query("floors").withIndex("by_survey", (q) => q.eq("surveyId", args.id))) {
      await ctx.db.delete(f._id);
    }
    for await (const p of ctx.db.query("photos").withIndex("by_survey", (q) => q.eq("surveyId", args.id))) {
      await ctx.storage.delete(p.storageId);
      await ctx.db.delete(p._id);
    }
    for await (const r of ctx.db.query("qcRemarks").withIndex("by_survey", (q) => q.eq("surveyId", args.id))) {
      await ctx.db.delete(r._id);
    }
    await ctx.db.delete(args.id);

    await writeAudit(ctx, {
      actorId: me._id,
      action: "survey.deleted",
      entity: "survey",
      entityId: args.id,
    });
  },
});

/* ────────────────────────── internal ────────────────────────── */

type SurveyUpsertArgs = {
  localId: string;
  municipalityId: Id<"municipalities">;
  clientUpdatedAt: number;
  wardNo: string;
  parcelNo: string;
  unitNo: string;
  mobileNo: string;
  locality: string;
  colonyName: string;
  city: string;
  pinCode: string;
  assessmentYear: string;
  ownershipType: string;
  propertyType: string;
  propertyUse: string;
  situation: string;
  roadType: string;
  taxRateZone: string;
  plotSqft: number;
  plinthSqft: number;
  isSlum: boolean;
  municipalWaterConnection: boolean;
  waterSource: Doc<"surveys">["waterSource"];
  sanitationType: Doc<"surveys">["sanitationType"];
  municipalWasteCollection: boolean;
  sectorNo?: string;
  oldPropertyNo?: string;
  propertyId?: string;
  constructedYear?: number;
  respondentName?: string;
  relationship?: string;
  owners?: Doc<"surveys">["owners"];
  familySize?: number;
  altMobileNo?: string;
  houseNo?: string;
  electricityNo?: string;
  gps?: Doc<"surveys">["gps"];
  street?: string;
};

function normalizePropertyFields<
  T extends {
    parcelNo?: string;
    unitNo?: string;
    sectorNo?: string;
    oldPropertyNo?: string;
    propertyId?: string;
    constructedYear?: number;
  },
>(args: T): T {
  return {
    ...args,
    sectorNo: args.sectorNo?.trim() || undefined,
    oldPropertyNo: args.oldPropertyNo?.trim() || undefined,
    propertyId: args.propertyId?.trim() || undefined,
    parcelNo: (args.parcelNo ?? "").trim(),
    unitNo: (args.unitNo ?? "").trim(),
    constructedYear: args.constructedYear,
  };
}

function normalizeOwnerFields<
  T extends {
    mobileNo?: string;
    altMobileNo?: string;
    respondentName?: string;
    relationship?: string;
    owners?: Doc<"surveys">["owners"];
    familySize?: number;
  },
>(args: T): T {
  const trimOpt = (s?: string) => {
    const t = s?.trim();
    return t ? t : undefined;
  };
  const owners = normalizeOwners(args.owners as Parameters<typeof normalizeOwners>[0]);
  const relationship = trimOpt(args.relationship as string | undefined);
  const mobileNo = primaryOwnerMobile(owners, relationship) ?? trimOpt(args.mobileNo as string | undefined) ?? "";
  const altMobileNo = owners?.[0]?.altMobileNo ?? trimOpt(args.altMobileNo as string | undefined);
  return {
    ...args,
    respondentName: trimOpt(args.respondentName as string | undefined),
    relationship,
    owners,
    mobileNo,
    altMobileNo,
    familySize: args.familySize as number | undefined,
  };
}

function stripLocalId<T extends { localId: string; surveyorId?: Id<"users"> }>(args: T): Omit<T, "localId"> {
  const { localId: _l, ...rest } = args;
  return rest;
}

type DraftMutationArgs = {
  localId: string;
  municipalityId: Id<"municipalities">;
  clientUpdatedAt: number;
  wardNo?: string;
  [key: string]: unknown;
};

function mergeDraftArgs(
  existing: Doc<"surveys"> | null,
  patch: DraftMutationArgs,
  muni: Doc<"municipalities">,
): SurveyUpsertArgs {
  const base: SurveyUpsertArgs = existing
    ? {
        localId: patch.localId,
        municipalityId: patch.municipalityId,
        clientUpdatedAt: patch.clientUpdatedAt,
        wardNo: existing.wardNo,
        sectorNo: existing.sectorNo,
        oldPropertyNo: existing.oldPropertyNo,
        propertyId: existing.propertyId,
        parcelNo: existing.parcelNo,
        unitNo: existing.unitNo,
        constructedYear: existing.constructedYear,
        isSlum: existing.isSlum,
        respondentName: existing.respondentName,
        relationship: existing.relationship,
        owners: existing.owners,
        familySize: existing.familySize,
        mobileNo: existing.mobileNo,
        altMobileNo: existing.altMobileNo,
        houseNo: existing.houseNo,
        locality: existing.locality,
        colonyName: existing.colonyName,
        pinCode: existing.pinCode,
        city: existing.city,
        assessmentYear: existing.assessmentYear,
        ownershipType: existing.ownershipType,
        propertyType: existing.propertyType,
        propertyUse: existing.propertyUse,
        situation: existing.situation,
        roadType: existing.roadType,
        taxRateZone: existing.taxRateZone,
        plotSqft: existing.plotSqft,
        plinthSqft: existing.plinthSqft,
        municipalWaterConnection: existing.municipalWaterConnection,
        waterSource: existing.waterSource,
        sanitationType: existing.sanitationType,
        municipalWasteCollection: existing.municipalWasteCollection,
        electricityNo: existing.electricityNo,
        gps: existing.gps,
      }
    : {
        localId: patch.localId,
        municipalityId: patch.municipalityId,
        clientUpdatedAt: patch.clientUpdatedAt,
        ...DRAFT_SURVEY_DEFAULTS,
        city: muni.name,
      };

  const { localId: _l, municipalityId: _m, clientUpdatedAt: _c, ...fields } = patch;
  return { ...base, ...pickDefined(fields) };
}

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

function validateBusinessRules(
  in_: Record<string, unknown>,
  addressCtx: Parameters<typeof validateAddressSection>[1],
  mode: "draft" | "submit" = "submit",
): void {
  const details: Record<string, string[]> = {};
  const strict = mode === "submit";

  Object.assign(
    details,
    validateOwnerSection(
      {
        relationship: in_.relationship as string | undefined,
        owners: in_.owners as Parameters<typeof validateOwnerSection>[0]["owners"],
      },
      { requirePrimaryMobile: strict },
    ),
  );
  const denormalizedMobile = String(in_.mobileNo ?? "").trim();
  if (denormalizedMobile && !isValidIndianOwnerMobile(denormalizedMobile)) {
    details.mobileNo = ["Enter a valid 10-digit mobile (starts 6-9)"];
  }
  Object.assign(
    details,
    validateAddressSection(
      {
        houseNo: in_.houseNo as string | undefined,
        locality: in_.locality as string,
        colonyName: in_.colonyName as string,
        city: in_.city as string,
        pinCode: in_.pinCode as string,
      },
      addressCtx,
      mode,
    ),
  );
  const plot = in_.plotSqft as unknown as number;
  const plinth = in_.plinthSqft as unknown as number;
  if (typeof plot === "number" && typeof plinth === "number" && plinth > plot && plot > 0) {
    details.plinthSqft = ["Plinth area cannot exceed plot area"];
  }
  const familySize = in_.familySize as unknown as number | undefined;
  if (familySize != null && (familySize < 1 || !Number.isInteger(familySize))) {
    details.familySize = ["Family size must be a whole number ≥ 1"];
  }

  const parcelNo = String(in_.parcelNo ?? "").trim();
  if (strict && !parcelNo) {
    details.parcelNo = ["Parcel number is required"];
  }
  const unitNo = String(in_.unitNo ?? "").trim();
  if (strict && !unitNo) {
    details.unitNo = ["Unit number is required"];
  }
  if (strict && !String(in_.assessmentYear ?? "").trim()) {
    details.assessmentYear = ["Assessment year is required"];
  }
  Object.assign(
    details,
    validateTaxationSection(
      {
        ownershipType: in_.ownershipType as string | undefined,
        propertyUse: in_.propertyUse as string | undefined,
        propertyType: in_.propertyType as string | undefined,
        situation: in_.situation as string | undefined,
        roadType: in_.roadType as string | undefined,
        taxRateZone: in_.taxRateZone as string | undefined,
      },
      mode,
    ),
  );
  Object.assign(
    details,
    validateServicesSection(
      {
        municipalWaterConnection: in_.municipalWaterConnection as boolean | undefined,
        waterSource: in_.waterSource as string | undefined,
        sanitationType: in_.sanitationType as string | undefined,
        municipalWasteCollection: in_.municipalWasteCollection as boolean | undefined,
      },
      mode,
    ),
  );
  const constructedYear = in_.constructedYear as unknown as number | undefined;
  if (constructedYear != null) {
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(constructedYear) || constructedYear < 1800 || constructedYear > currentYear) {
      details.constructedYear = [`Enter a year between 1800 and ${currentYear}`];
    }
  }
  if (
    strict &&
    in_.gps &&
    (in_.gps as unknown as { accuracyMeters: number }).accuracyMeters > GPS_ACCEPT_MAX_ACCURACY_METERS
  ) {
    details.gps = [
      `GPS must be within ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m (target ±${GPS_TARGET_ACCURACY_METERS} m) — retake in open sky`,
    ];
  }
  if (Object.keys(details).length > 0) {
    throw new ConvexError({
      code: "VALIDATION",
      message: "Business rule violation",
      details,
    });
  }
}
