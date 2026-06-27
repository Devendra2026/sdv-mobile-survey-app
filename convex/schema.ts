import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/* ────────────────────────── reusable validators ────────────────────────── */

/** Role key — built-in: pending | surveyor | supervisor | admin; admin may add custom keys via rbac. */
export const userRole = v.string();

const userStatus = v.union(v.literal("pending_approval"), v.literal("active"), v.literal("disabled"));

export const surveyStatus = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const qcStatus = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"));

export const photoSlot = v.union(v.literal("front"), v.literal("inside"), v.literal("side"), v.literal("document"));

/** ULB body types shown in admin setup and survey start. */
export const ulbBodyType = v.union(v.literal("municipal_council"), v.literal("town_panchayat"));

import { sanitationType, waterSource } from "./serviceMasters";

export { sanitationType, waterSource };

export const gpsCapture = v.object({
  latitude: v.number(),
  longitude: v.number(),
  accuracyMeters: v.number(),
  capturedAt: v.number(),
  provider: v.optional(v.string()),
  isMockLocation: v.optional(v.boolean()),
});

/** One co-owner row on a survey (name, patronymic, contact optional per row). */
export const surveyOwnerEntry = v.object({
  name: v.optional(v.string()),
  fatherOrHusbandName: v.optional(v.string()),
  mobileNo: v.optional(v.string()),
  altMobileNo: v.optional(v.string()),
});

/* ────────────────────────── schema ────────────────────────── */

export default defineSchema({
  /**
   * users — bridge between Clerk identities and our domain.
   *
   * Created via the Clerk webhook in `convex/http.ts` whenever someone
   * signs up. New users land in `status: 'pending_approval'` and
   * `role: 'pending'`; an admin promotes them via `admin.approveUser`.
   *
   * Every Convex function authenticates the caller via Clerk JWT and then
   * looks up this row to enforce role/tenancy. Never trust client-supplied
   * userIds — always derive from `ctx.auth.getUserIdentity()`.
   */
  users: defineTable({
    clerkId: v.string(), // identifier from Clerk's `subject`
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),

    role: userRole,
    status: userStatus,
    /** District-level scope — surveyors/supervisors with multiple ULBs in one district. */
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
    wardAssignments: v.array(v.string()), // ward_no list ("12", "14A")

    requestedRole: v.optional(v.string()), // what the user asked for at sign-up
    requestedReason: v.optional(v.string()),

    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    disabledBy: v.optional(v.id("users")),
    disabledAt: v.optional(v.number()),

    lastSeenAt: v.optional(v.number()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_status", ["status"])
    .index("by_role_status", ["role", "status"])
    .index("by_municipality", ["municipalityId"])
    .index("by_district", ["districtId"]),

  /**
   * Tenants — districts → municipalities (ULB) → wards.
   * Admin manages via `tenants.*` mutations; surveyors see scoped subsets.
   */
  districts: defineTable({
    code: v.string(),
    name: v.string(),
    stateName: v.string(),
    isActive: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

  municipalities: defineTable({
    code: v.string(),
    name: v.string(),
    bodyType: ulbBodyType,
    districtId: v.id("districts"),
    /** Admin-assigned postal code for surveys in this ULB (6 digits). */
    postalCode: v.optional(v.string()),
    /** Digital signature image for demand notices (Executive Officer). */
    executiveSignatureStorageId: v.optional(v.id("_storage")),
    isActive: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_district", ["districtId"])
    .index("by_district_active", ["districtId", "isActive"]),

  wards: defineTable({
    municipalityId: v.id("municipalities"),
    /** Official ward number shown in dropdowns (e.g. "12", "14A"). */
    wardNo: v.string(),
    /** Municipal ward code (e.g. AGR-W01) — unique per ULB. */
    wardCode: v.string(),
    name: v.string(),
  })
    .index("by_municipality_ward", ["municipalityId", "wardNo"])
    .index("by_municipality_ward_code", ["municipalityId", "wardCode"]),

  /**
   * surveys — the main entity.
   *
   * `localId` is the idempotency key: the mobile app generates it before
   * the first sync, and re-sending the same payload upserts into the same
   * row. The `by_surveyor_localId` unique-ish index makes this O(1).
   *
   * Floors and photos live in separate tables for normalisation, but the
   * GPS object is inline because it's strictly 1:1 and queried with the
   * survey 100% of the time.
   *
   * `serverVersion` increments on every server-side write — the mobile
   * uses it to detect "this survey changed under me, re-fetch".
   */
  surveys: defineTable({
    localId: v.string(),
    surveyorId: v.id("users"),
    /** Denormalized tenant key — Agra / Kasganj / … data is queried by district. */
    districtId: v.id("districts"),
    municipalityId: v.id("municipalities"),
    wardNo: v.string(),

    status: surveyStatus,
    qcStatus: qcStatus,
    serverVersion: v.number(),
    clientUpdatedAt: v.number(),
    submittedAt: v.optional(v.number()),
    /** Denormalized field-completion % — updated on draft save. */
    completionPct: v.optional(v.number()),

    // Section 1 — Property
    sectorNo: v.optional(v.string()),
    oldPropertyNo: v.optional(v.string()),
    propertyId: v.optional(v.string()),
    parcelNo: v.string(),
    unitNo: v.string(),
    constructedYear: v.optional(v.number()),
    isSlum: v.boolean(),

    // Section 2 — Owner (mobile required; rest optional at capture)
    respondentName: v.optional(v.string()),
    relationship: v.optional(v.string()),
    owners: v.optional(v.array(surveyOwnerEntry)),
    familySize: v.optional(v.number()),
    /** Primary contact — denormalized from first owner mobile on save. */
    mobileNo: v.string(),
    altMobileNo: v.optional(v.string()),

    // Section 3 — Address
    houseNo: v.optional(v.string()),
    locality: v.string(),
    colonyName: v.string(),
    /** Denormalized ULB name (city / town). */
    city: v.string(),
    pinCode: v.string(),

    // Section 4 — Taxation
    assessmentYear: v.string(),
    ownershipType: v.string(),
    /** Property-use subcategory when use is residential, commercial, or mix. */
    propertyType: v.string(),
    propertyUse: v.string(),
    situation: v.string(),
    roadType: v.string(),
    taxRateZone: v.string(),
    plotSqft: v.number(),
    plinthSqft: v.number(),

    // Section 6 — Services
    municipalWaterConnection: v.boolean(),
    waterSource,
    sanitationType,
    municipalWasteCollection: v.boolean(),
    electricityNo: v.optional(v.string()),

    // Section 7 — GIS (inline)
    gps: v.optional(gpsCapture),
  })
    .index("by_surveyor_localId", ["surveyorId", "localId"]) // idempotency lookup
    .index("by_surveyor", ["surveyorId"])
    .index("by_status", ["status"])
    .index("by_qc_status", ["qcStatus"])
    .index("by_district", ["districtId"])
    .index("by_district_status", ["districtId", "status"])
    .index("by_municipality_ward", ["municipalityId", "wardNo"])
    .index("by_municipality_status", ["municipalityId", "status"])
    .index("by_property_id", ["propertyId"]),

  /** floors — 1:N to a survey; ordered by `position`. */
  floors: defineTable({
    surveyId: v.id("surveys"),
    clientFloorId: v.string(), // client-generated id; idempotency
    position: v.number(),
    floorName: v.string(),
    usageFactor: v.optional(v.string()),
    usageType: v.string(),
    constructionType: v.string(),
    isOccupied: v.boolean(),
    areaSqft: v.number(),
  })
    .index("by_survey", ["surveyId"])
    .index("by_survey_clientFloorId", ["surveyId", "clientFloorId"]),

  /**
   * photos — pointers to Convex file storage. The actual JPEG bytes live in
   * `_storage` (managed by Convex); `storageId` is the reference.
   *
   * Upload flow:
   *   1. mobile calls `photos.generateUploadUrl` (Convex returns a signed POST URL)
   *   2. mobile POSTs the compressed image bytes to that URL
   *   3. mobile calls `photos.linkPhoto` with the resulting storageId
   */
  photos: defineTable({
    surveyId: v.id("surveys"),
    slot: photoSlot,
    storageId: v.id("_storage"),
    sizeKb: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    capturedAt: v.number(),
    uploadedBy: v.id("users"),
  })
    .index("by_survey", ["surveyId"])
    .index("by_survey_slot", ["surveyId", "slot"])
    .index("by_storageId", ["storageId"]),

  /**
   * qcRemarks — chat-style thread between supervisor and surveyor.
   * Append-only; resolution is tracked on the parent survey + qcDecisions row.
   */
  qcRemarks: defineTable({
    surveyId: v.id("surveys"),
    authorId: v.id("users"),
    authorRole: v.string(), // snapshot at write-time
    message: v.string(),
    taggedSections: v.array(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved")),
  }).index("by_survey", ["surveyId"]),

  /** qcDecisions — formal approve/reject events. One row per decision. */
  qcDecisions: defineTable({
    surveyId: v.id("surveys"),
    reviewerId: v.id("users"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    comment: v.optional(v.string()),
    taggedSections: v.array(v.string()),
    decidedAt: v.number(),
  })
    .index("by_survey", ["surveyId"])
    .index("by_reviewer", ["reviewerId"])
    .index("by_reviewer_decided", ["reviewerId", "decidedAt"]),

  /**
   * masters — every dropdown the mobile shows. Categorised so the bundle
   * query in `masters.bundle` can return them grouped.
   */
  masters: defineTable({
    category: v.string(), // assessment_year, ownership_type, …
    value: v.string(),
    label: v.string(),
    position: v.number(),
    isActive: v.boolean(),
  })
    .index("by_category_position", ["category", "isActive", "position"])
    .index("by_category_value", ["category", "value"]),

  /**
   * auditLogs — append-only trail for compliance.
   *
   * Convex doesn't have row-level immutability primitives, but we enforce
   * write-only access in code: only `helpers.audit.write` (called from
   * server-side mutations) inserts here; no public mutation exposes
   * update or delete. UI reads through `audit.list`.
   */
  auditLogs: defineTable({
    actorId: v.optional(v.id("users")),
    action: v.string(), // user.approved, survey.submitted, qc.rejected, …
    entity: v.string(), // user | survey | qc | masters | …
    entityId: v.optional(v.string()),
    metadata: v.optional(v.any()), // JSON snapshot — before/after, IP, etc.
  })
    .index("by_entity", ["entity", "entityId"])
    .index("by_actor", ["actorId"]),

  /**
   * notifications — destined for the mobile bell icon + in-app banners.
   * `readAt` is null when unread; index includes it so the unread badge
   * count is a fast index scan.
   */
  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(), // qc_rejected, qc_approved, account_approved, …
    title: v.string(),
    body: v.string(),
    relatedEntity: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    readAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "readAt"]),

  /** Admin-defined permission catalog (synced to mobile/web via Convex queries). */
  permissions: defineTable({
    key: v.string(),
    label: v.string(),
    category: v.string(),
    isActive: v.boolean(),
  }).index("by_key", ["key"]),

  /** Dynamic roles — system roles are seeded; admin may add custom roles. */
  roles: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    isSystem: v.boolean(),
    isActive: v.boolean(),
  }).index("by_key", ["key"]),

  rolePermissions: defineTable({
    roleId: v.id("roles"),
    permissionKey: v.string(),
  })
    .index("by_role", ["roleId"])
    .index("by_role_permission", ["roleId", "permissionKey"]),

  /**
   * taxRates — per-municipality dynamic pricing for property tax calculation.
   *
   * Each ULB sets its own ALV zone rates, tax percentages, and usage multipliers.
   * The demand notice engine falls back to system defaults when no row exists.
   * Admin manages via `taxRates.upsert`; any update overwrites the single row.
   */
  taxRates: defineTable({
    municipalityId: v.id("municipalities"),
    /**
     * 2D rate matrix: road-width zone → construction type → ₹/sqft/year (annual ALV base rate).
     * e.g. rateMatrix["below_9m"]["pakka_rcc_rb"] = 6.12
     */
    rateMatrix: v.optional(v.record(v.string(), v.record(v.string(), v.number()))),
    /** Per-ward rate matrix: wardNo → zone → construction → annual ₹/sqft. */
    wardRates: v.optional(v.record(v.string(), v.record(v.string(), v.record(v.string(), v.number())))),
    /** Road surface type multipliers: rcc | dambar | kaccha → factor (e.g. 0.9). */
    roadTypeFactors: v.optional(v.record(v.string(), v.number())),
    /** @deprecated Legacy flat zone rates — migrated to rateMatrix on read/save. */
    zoneRates: v.optional(v.record(v.string(), v.number())),
    /** Tax percentages stored as decimals (e.g. 0.10 = 10%). */
    propertyTaxPct: v.number(),
    waterTaxPct: v.number(),
    drainageTaxPct: v.number(),
    /** Usage multipliers keyed by usageFactor / propertyUse value. */
    usageMultipliers: v.record(v.string(), v.number()),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }).index("by_municipality", ["municipalityId"]),

  /**
   * Multi-city supervisor/surveyor allotment (district-wide or per-ULB).
   * Active rows define tenant scope; inactive rows keep history.
   */
  userAllotments: defineTable({
    userId: v.id("users"),
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
    isActive: v.boolean(),
    assignedBy: v.id("users"),
    assignedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"]),

  /**
   * Precomputed survey counters per scope bucket (surveyor / municipality / district / ward).
   * Maintained by syncSurveyAggregates on survey writes — powers dashboard KPIs without full collects.
   */
  surveyAggregateBuckets: defineTable({
    bucketKey: v.string(),
    total: v.number(),
    drafts: v.number(),
    submitted: v.number(),
    pending: v.number(),
    approved: v.number(),
    rejected: v.number(),
  }).index("by_bucketKey", ["bucketKey"]),

  /** Per-day created/submitted counts per bucket — powers "today" KPIs. */
  surveyDailyRollups: defineTable({
    bucketKey: v.string(),
    dateKey: v.string(),
    created: v.number(),
    submitted: v.number(),
  })
    .index("by_bucket_date", ["bucketKey", "dateKey"])
    .index("by_bucketKey", ["bucketKey"]),

  /** Bulk demand notice PDF export jobs (parcel-ordered, client captures official A4 layout). */
  demandNoticeExportJobs: defineTable({
    requestedBy: v.id("users"),
    municipalityId: v.id("municipalities"),
    districtId: v.optional(v.id("districts")),
    wardNo: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("rendering"),
      v.literal("uploading"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    surveyIds: v.array(v.id("surveys")),
    processedCount: v.number(),
    totalCount: v.number(),
    storageId: v.optional(v.id("_storage")),
    filename: v.string(),
    reportDateMs: v.number(),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_user_created", ["requestedBy", "createdAt"]),
});
