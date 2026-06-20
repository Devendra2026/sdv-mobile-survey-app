/**
 * Full survey export (all mobile fields + floors + photos) and Excel re-import.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { normalizeAddressFields } from "./addressRules";
import { normalizeFloorFields, presentFloorRow, usageTypeToOccupied, validateFloorRow } from "./areaMasters";
import { hasCapability, requireCapability } from "./capabilities";
import { fieldSurveyAccess, querySurveysInFieldScope } from "./fieldAccess";
import { assertCanReadWard, clientError, mapTruthyById, requireUser, writeAudit } from "./helpers";
import { lookupSurveyByPropertyId } from "./lib/propertyIdLookup";
import { comparePropertyIds, resolvePropertyId } from "./propertyId";
import { gpsCapture, photoSlot, qcStatus, sanitationType, surveyOwnerEntry, surveyStatus, waterSource } from "./schema";
import {
  mergeDraftArgs,
  normalizeOwnerFields,
  normalizePropertyFields,
  stripLocalId,
  withResolvedPropertyId,
} from "./survey";
import { assertMunicipalityInScope, resolveTenantScope, tenantDistrictIds } from "./tenancy";

function registerPropertyIdMapping(
  map: Map<string, Id<"surveys">>,
  surveyId: Id<"surveys">,
  ...ids: (string | undefined)[]
): void {
  for (const id of ids) {
    const key = id?.trim().toUpperCase();
    if (key) map.set(key, surveyId);
  }
}

const listFilterArgs = {
  status: v.optional(surveyStatus),
  qcStatus: v.optional(qcStatus),
  wardNo: v.optional(v.string()),
  districtId: v.optional(v.id("districts")),
  municipalityId: v.optional(v.id("municipalities")),
  surveyorId: v.optional(v.id("users")),
};

async function loadMunicipalityCodes(
  ctx: QueryCtx,
  municipalityIds: Id<"municipalities">[],
): Promise<Map<Id<"municipalities">, string>> {
  const unique = [...new Set(municipalityIds)];
  const munis = await Promise.all(unique.map((id) => ctx.db.get(id)));
  const codes = new Map<Id<"municipalities">, string>();
  for (const m of munis) {
    if (m) codes.set(m._id, m.code);
  }
  return codes;
}

function enrichSurveyPropertyIds(rows: Doc<"surveys">[], codes: Map<Id<"municipalities">, string>): Doc<"surveys">[] {
  return rows.map((row) => ({
    ...row,
    propertyId: resolvePropertyId(row, codes.get(row.municipalityId) ?? "") ?? row.propertyId,
  }));
}

const exportPhotoValidator = v.object({
  slot: photoSlot,
  sizeKb: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  capturedAt: v.number(),
  url: v.union(v.string(), v.null()),
});

const exportFloorValidator = v.object({
  _id: v.id("floors"),
  _creationTime: v.number(),
  surveyId: v.id("surveys"),
  clientFloorId: v.string(),
  position: v.number(),
  floorName: v.string(),
  usageFactor: v.optional(v.string()),
  usageType: v.string(),
  constructionType: v.string(),
  isOccupied: v.boolean(),
  areaSqft: v.number(),
});

/** Full survey row + labels + child rows returned to the Excel exporter. */
const exportBundleValidator = v.object({
  _id: v.id("surveys"),
  _creationTime: v.number(),
  localId: v.string(),
  surveyorId: v.id("users"),
  districtId: v.id("districts"),
  municipalityId: v.id("municipalities"),
  wardNo: v.string(),
  status: surveyStatus,
  qcStatus,
  serverVersion: v.number(),
  clientUpdatedAt: v.number(),
  submittedAt: v.optional(v.number()),
  completionPct: v.optional(v.number()),
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
  colonyName: v.string(),
  city: v.string(),
  pinCode: v.string(),
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
  districtName: v.string(),
  municipalityName: v.string(),
  municipalityCode: v.string(),
  surveyorName: v.string(),
  surveyorEmail: v.string(),
  floors: v.array(exportFloorValidator),
  photos: v.array(exportPhotoValidator),
});

const EXPORT_SCOPE_LIMIT = 5000;
const DEFAULT_EXPORT_PAGE_SIZE = 30;
const MAX_EXPORT_PAGE_SIZE = 50;

async function enrichSurveysForExport(
  ctx: QueryCtx,
  surveys: Doc<"surveys">[],
  codes: Map<Id<"municipalities">, string>,
) {
  if (surveys.length === 0) {
    return [];
  }

  const enriched = enrichSurveyPropertyIds(surveys, codes);

  const muniIdSet = [...new Set(enriched.map((r) => r.municipalityId))];
  const districtIdSet = [...new Set(enriched.map((r) => r.districtId))];
  const surveyorIdSet = [...new Set(enriched.map((r) => r.surveyorId))];

  const [munis, districts, surveyors] = await Promise.all([
    Promise.all(muniIdSet.map((id) => ctx.db.get(id))),
    Promise.all(districtIdSet.map((id) => ctx.db.get(id))),
    Promise.all(surveyorIdSet.map((id) => ctx.db.get(id))),
  ]);

  const muniMap = mapTruthyById(munis);
  const districtMap = mapTruthyById(districts);
  const surveyorMap = mapTruthyById(surveyors);

  const bundles = await Promise.all(
    enriched.map(async (survey) => {
      const [floorRows, photoRows] = await Promise.all([
        ctx.db
          .query("floors")
          .withIndex("by_survey", (q) => q.eq("surveyId", survey._id))
          .collect(),
        ctx.db
          .query("photos")
          .withIndex("by_survey", (q) => q.eq("surveyId", survey._id))
          .collect(),
      ]);

      const photos = await Promise.all(
        photoRows.map(async (p) => ({
          slot: p.slot,
          sizeKb: p.sizeKb,
          width: p.width,
          height: p.height,
          capturedAt: p.capturedAt,
          url: await ctx.storage.getUrl(p.storageId),
        })),
      );

      const muni = muniMap.get(survey.municipalityId);
      const district = districtMap.get(survey.districtId);
      const surveyor = surveyorMap.get(survey.surveyorId);

      return {
        ...survey,
        districtName: district?.name ?? "",
        municipalityName: muni?.name ?? survey.city,
        municipalityCode: muni?.code ?? "",
        surveyorName: surveyor?.name ?? "",
        surveyorEmail: surveyor?.email ?? "",
        floors: floorRows.sort((a, b) => a.position - b.position).map(presentFloorRow),
        photos,
      };
    }),
  );

  return bundles;
}

/** Same filters as survey.list; paginate with offset/pageSize to stay under read limits. */
export const listForExport = query({
  args: {
    ...listFilterArgs,
    offset: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    bundles: v.array(exportBundleValidator),
    total: v.number(),
    nextOffset: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const [access, canExport] = await Promise.all([
      fieldSurveyAccess(ctx, me),
      hasCapability(ctx, me, "reports.export"),
    ]);
    if (access === "none" || (!canExport && access !== "own")) {
      clientError("FORBIDDEN", "You don't have permission for this action.");
    }
    const offset = Math.max(args.offset ?? 0, 0);
    const pageSize = Math.min(Math.max(args.pageSize ?? DEFAULT_EXPORT_PAGE_SIZE, 1), MAX_EXPORT_PAGE_SIZE);

    const scope = await resolveTenantScope(ctx, me);
    const districtIds = tenantDistrictIds(scope);

    if (args.municipalityId) {
      await assertMunicipalityInScope(ctx, me, args.municipalityId);
    }
    if (args.districtId && access !== "admin" && !districtIds.has(args.districtId)) {
      clientError("FORBIDDEN", "This district is outside your assigned scope");
    }

    let rows = await querySurveysInFieldScope(ctx, me, {
      municipalityId: args.municipalityId,
      districtId: args.districtId,
      status: args.status,
      surveyorId: args.surveyorId,
      limit: EXPORT_SCOPE_LIMIT,
    });

    if (args.districtId) rows = rows.filter((r) => r.districtId === args.districtId);
    if (args.municipalityId) rows = rows.filter((r) => r.municipalityId === args.municipalityId);
    if (args.surveyorId) rows = rows.filter((r) => r.surveyorId === args.surveyorId);
    if (args.status && access !== "assigned") {
      rows = rows.filter((r) => r.status === args.status);
    }
    if (args.qcStatus) rows = rows.filter((r) => r.qcStatus === args.qcStatus);
    if (args.wardNo) rows = rows.filter((r) => r.wardNo === args.wardNo);
    rows.sort((a, b) => comparePropertyIds(a.propertyId, b.propertyId));

    const total = rows.length;
    const page = rows.slice(offset, offset + pageSize);
    const codes = await loadMunicipalityCodes(
      ctx,
      page.map((r) => r.municipalityId),
    );
    const bundles = await enrichSurveysForExport(ctx, page, codes);
    const nextOffset = offset + pageSize < total ? offset + pageSize : null;

    return { bundles, total, nextOffset };
  },
});

const importSurveyRow = v.object({
  localId: v.string(),
  municipalityId: v.id("municipalities"),
  wardNo: v.string(),
  propertyId: v.optional(v.string()),
  sectorNo: v.optional(v.string()),
  oldPropertyNo: v.optional(v.string()),
  parcelNo: v.string(),
  unitNo: v.string(),
  constructedYear: v.optional(v.number()),
  isSlum: v.optional(v.boolean()),
  respondentName: v.optional(v.string()),
  relationship: v.optional(v.string()),
  familySize: v.optional(v.number()),
  mobileNo: v.optional(v.string()),
  altMobileNo: v.optional(v.string()),
  houseNo: v.optional(v.string()),
  locality: v.optional(v.string()),
  colonyName: v.optional(v.string()),
  city: v.optional(v.string()),
  pinCode: v.optional(v.string()),
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
  waterSource: v.optional(v.string()),
  sanitationType: v.optional(v.string()),
  municipalWasteCollection: v.optional(v.boolean()),
  electricityNo: v.optional(v.string()),
  owners: v.optional(
    v.array(
      v.object({
        name: v.optional(v.string()),
        fatherOrHusbandName: v.optional(v.string()),
        mobileNo: v.optional(v.string()),
        altMobileNo: v.optional(v.string()),
      }),
    ),
  ),
});

const importFloorRow = v.object({
  propertyId: v.string(),
  clientFloorId: v.string(),
  position: v.number(),
  floorName: v.string(),
  usageFactor: v.optional(v.string()),
  usageType: v.string(),
  constructionType: v.string(),
  isOccupied: v.optional(v.boolean()),
  areaSqft: v.number(),
});

/** Re-import survey + floor rows from Excel (supervisor/admin). Matches by Property ID or Local ID. */
export const importExcelBundle = mutation({
  args: {
    surveys: v.array(importSurveyRow),
    floors: v.optional(v.array(importFloorRow)),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await requireCapability(ctx, me, "reports.export");

    let created = 0;
    let updated = 0;
    const errors: { propertyId?: string; localId?: string; message: string }[] = [];
    const propertyIdToSurveyId = new Map<string, Id<"surveys">>();

    for (const row of args.surveys) {
      try {
        const muni = await ctx.db.get(row.municipalityId);
        if (!muni) {
          errors.push({ localId: row.localId, message: "Unknown municipality" });
          continue;
        }
        await assertMunicipalityInScope(ctx, me, row.municipalityId);
        if (row.wardNo) assertCanReadWard(me, row.municipalityId, row.wardNo);

        let existing: Doc<"surveys"> | null = null;
        const pid = row.propertyId?.trim().toUpperCase();
        if (pid) {
          existing = (await lookupSurveyByPropertyId(ctx, pid)) ?? null;
        }
        if (!existing) {
          existing =
            (await ctx.db
              .query("surveys")
              .withIndex("by_surveyor_localId", (q) => q.eq("surveyorId", me._id).eq("localId", row.localId))
              .unique()) ?? null;
        }

        const merged = mergeDraftArgs(
          existing,
          {
            localId: row.localId,
            municipalityId: row.municipalityId,
            clientUpdatedAt: Date.now(),
            wardNo: row.wardNo,
            sectorNo: row.sectorNo,
            oldPropertyNo: row.oldPropertyNo,
            propertyId: pid,
            parcelNo: row.parcelNo,
            unitNo: row.unitNo,
            constructedYear: row.constructedYear,
            isSlum: row.isSlum,
            respondentName: row.respondentName,
            relationship: row.relationship,
            owners: row.owners,
            familySize: row.familySize,
            mobileNo: row.mobileNo,
            altMobileNo: row.altMobileNo,
            houseNo: row.houseNo,
            locality: row.locality,
            colonyName: row.colonyName,
            pinCode: row.pinCode,
            city: row.city ?? muni.name,
            assessmentYear: row.assessmentYear,
            ownershipType: row.ownershipType,
            propertyType: row.propertyType,
            propertyUse: row.propertyUse,
            situation: row.situation,
            roadType: row.roadType,
            taxRateZone: row.taxRateZone,
            plotSqft: row.plotSqft,
            plinthSqft: row.plinthSqft,
            municipalWaterConnection: row.municipalWaterConnection,
            waterSource: row.waterSource as Doc<"surveys">["waterSource"],
            sanitationType: row.sanitationType as Doc<"surveys">["sanitationType"],
            municipalWasteCollection: row.municipalWasteCollection,
            electricityNo: row.electricityNo,
          },
          muni,
        );

        const normalized = normalizeAddressFields(
          normalizeOwnerFields(withResolvedPropertyId(normalizePropertyFields(merged), muni.code)),
          muni,
        );

        const writable = {
          ...stripLocalId(normalized as Parameters<typeof stripLocalId>[0]),
          districtId: muni.districtId,
        };

        if (existing) {
          await ctx.db.patch(existing._id, {
            ...writable,
            serverVersion: existing.serverVersion + 1,
            clientUpdatedAt: Date.now(),
          });
          updated++;
          registerPropertyIdMapping(propertyIdToSurveyId, existing._id, normalized.propertyId, pid);
        } else {
          const newId = await ctx.db.insert("surveys", {
            ...writable,
            surveyorId: me._id,
            localId: row.localId,
            status: "draft",
            qcStatus: "pending",
            serverVersion: 1,
            clientUpdatedAt: Date.now(),
          } as Doc<"surveys">);
          created++;
          registerPropertyIdMapping(propertyIdToSurveyId, newId, normalized.propertyId, pid);
        }
      } catch (e) {
        errors.push({
          localId: row.localId,
          propertyId: row.propertyId,
          message: e instanceof Error ? e.message : "Import failed",
        });
      }
    }

    for (const fl of args.floors ?? []) {
      const pid = fl.propertyId.trim().toUpperCase();
      let surveyId = propertyIdToSurveyId.get(pid);
      if (!surveyId) {
        const s = await lookupSurveyByPropertyId(ctx, pid);
        surveyId = s?._id;
      }
      if (!surveyId) {
        errors.push({ propertyId: pid, message: "Floor row: survey not found for Property ID" });
        continue;
      }
      const survey = await ctx.db.get(surveyId);
      if (!survey) continue;
      assertCanReadWard(me, survey.municipalityId, survey.wardNo);

      const normalized = normalizeFloorFields({ usageFactor: fl.usageFactor, usageType: fl.usageType });
      const floorErrors = validateFloorRow({
        floorName: fl.floorName,
        usageFactor: normalized.usageFactor || undefined,
        usageType: normalized.usageType,
        constructionType: fl.constructionType,
        areaSqft: fl.areaSqft,
      });
      if (Object.keys(floorErrors).length > 0) {
        errors.push({ propertyId: pid, message: "Invalid floor row" });
        continue;
      }

      const existing = await ctx.db
        .query("floors")
        .withIndex("by_survey_clientFloorId", (q) => q.eq("surveyId", surveyId!).eq("clientFloorId", fl.clientFloorId))
        .unique();

      const floorDoc = {
        position: fl.position,
        floorName: fl.floorName,
        usageFactor: normalized.usageFactor || undefined,
        usageType: normalized.usageType,
        constructionType: fl.constructionType,
        isOccupied: fl.isOccupied ?? usageTypeToOccupied(normalized.usageType),
        areaSqft: fl.areaSqft,
      };

      if (existing) {
        await ctx.db.patch(existing._id, floorDoc);
      } else {
        await ctx.db.insert("floors", { surveyId: surveyId!, clientFloorId: fl.clientFloorId, ...floorDoc });
      }
    }

    await writeAudit(ctx, {
      actorId: me._id,
      action: "survey.excel_import",
      entity: "survey",
      entityId: me._id,
      metadata: { created, updated, errorCount: errors.length },
    });

    return { created, updated, errors };
  },
});
