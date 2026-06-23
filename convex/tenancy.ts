/**
 * Shared tenant-scope resolution for queries and mutations.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { roleRequiresTenancy } from "./capabilities";

function isActive<T extends { isActive?: boolean }>(row: T): boolean {
  return row.isActive !== false;
}

/** Resolve ULBs/districts from ward numbers when profile tenant ids are missing. */
async function scopeFromWardAssignments(
  ctx: QueryCtx,
  me: Doc<"users">,
  districtsAll: Doc<"districts">[],
  municipalitiesAll: Doc<"municipalities">[],
): Promise<{ districts: Doc<"districts">[]; municipalities: Doc<"municipalities">[] } | null> {
  if (me.wardAssignments.length === 0) return null;

  const wardSet = new Set(me.wardAssignments);
  const candidateMuniIds = new Set<Id<"municipalities">>();
  if (me.municipalityId) candidateMuniIds.add(me.municipalityId);

  const allotmentRows = await ctx.db
    .query("userAllotments")
    .withIndex("by_user_active", (q) => q.eq("userId", me._id).eq("isActive", true))
    .collect();
  for (const row of allotmentRows) {
    if (row.municipalityId) {
      candidateMuniIds.add(row.municipalityId);
    } else if (row.districtId) {
      for (const m of municipalitiesAll) {
        if (m.districtId === row.districtId) candidateMuniIds.add(m._id);
      }
    }
  }
  if (candidateMuniIds.size === 0 && me.districtId) {
    for (const m of municipalitiesAll) {
      if (m.districtId === me.districtId) candidateMuniIds.add(m._id);
    }
  }

  const candidateMunis =
    candidateMuniIds.size > 0 ? municipalitiesAll.filter((m) => candidateMuniIds.has(m._id)) : municipalitiesAll;

  const wardBatches = await Promise.all(
    candidateMunis.map((muni) =>
      ctx.db
        .query("wards")
        .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", muni._id))
        .collect(),
    ),
  );
  const matched: Doc<"wards">[] = [];
  for (const rows of wardBatches) {
    for (const w of rows) {
      if (wardSet.has(w.wardNo)) matched.push(w);
    }
  }
  if (matched.length === 0) return null;

  const muniIds = new Set(matched.map((w) => w.municipalityId));
  const municipalities = municipalitiesAll.filter((m) => muniIds.has(m._id));
  if (municipalities.length === 0) return null;

  const districtIds = new Set(municipalities.map((m) => m.districtId));
  const districts = districtsAll.filter((d) => districtIds.has(d._id));
  return { districts, municipalities };
}

/** District id from user row or their assigned ULB. */
export async function effectiveDistrictId(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<Id<"districts"> | undefined> {
  if (user.districtId) {
    const dist = await ctx.db.get(user.districtId);
    if (dist && isActive(dist)) return user.districtId;
  }
  if (user.municipalityId) {
    const muni = await ctx.db.get(user.municipalityId);
    if (muni && isActive(muni)) return muni.districtId;
  }
  return undefined;
}

function scopeForDistrict(
  districtId: Id<"districts">,
  districtsAll: Doc<"districts">[],
  municipalitiesAll: Doc<"municipalities">[],
): { districts: Doc<"districts">[]; municipalities: Doc<"municipalities">[] } {
  return {
    districts: districtsAll.filter((d) => d._id === districtId),
    municipalities: municipalitiesAll.filter((m) => m.districtId === districtId),
  };
}

/** Multi-district / multi-ULB scope from userAllotments (Agra + Mathura + Hathras, etc.). */
async function resolveScopeFromAllotments(
  ctx: QueryCtx,
  me: Doc<"users">,
  districtsAll: Doc<"districts">[],
  municipalitiesAll: Doc<"municipalities">[],
): Promise<{ districts: Doc<"districts">[]; municipalities: Doc<"municipalities">[] } | null> {
  const rows = await ctx.db
    .query("userAllotments")
    .withIndex("by_user_active", (q) => q.eq("userId", me._id).eq("isActive", true))
    .collect();

  if (rows.length === 0) return null;

  const districtIds = new Set<Id<"districts">>();
  const municipalityIds = new Set<Id<"municipalities">>();
  const muniById = new Map(municipalitiesAll.map((m) => [m._id, m]));

  for (const row of rows) {
    if (row.municipalityId) {
      municipalityIds.add(row.municipalityId);
      const muni = muniById.get(row.municipalityId);
      if (muni && isActive(muni)) districtIds.add(muni.districtId);
    } else if (row.districtId) {
      districtIds.add(row.districtId);
      for (const m of municipalitiesAll) {
        if (m.districtId === row.districtId) municipalityIds.add(m._id);
      }
    }
  }

  if (municipalityIds.size === 0 && districtIds.size === 0) return null;

  return {
    districts: districtsAll.filter((d) => districtIds.has(d._id)),
    municipalities: municipalitiesAll.filter((m) => municipalityIds.has(m._id)),
  };
}

/** Union profile tenant ids with an allotment-derived scope (primary ULB + multi-city rows). */
function mergeScopeWithProfile(
  scope: { districts: Doc<"districts">[]; municipalities: Doc<"municipalities">[] },
  me: Doc<"users">,
  districtsAll: Doc<"districts">[],
  municipalitiesAll: Doc<"municipalities">[],
): { districts: Doc<"districts">[]; municipalities: Doc<"municipalities">[] } {
  const districtIds = new Set(scope.districts.map((d) => d._id));
  const municipalityIds = new Set(scope.municipalities.map((m) => m._id));

  if (me.municipalityId) {
    const muni = municipalitiesAll.find((m) => m._id === me.municipalityId);
    if (muni && isActive(muni)) {
      municipalityIds.add(muni._id);
      districtIds.add(muni.districtId);
    }
  }
  if (me.districtId) {
    districtIds.add(me.districtId);
    for (const m of municipalitiesAll) {
      if (m.districtId === me.districtId) municipalityIds.add(m._id);
    }
  }

  return {
    districts: districtsAll.filter((d) => districtIds.has(d._id)),
    municipalities: municipalitiesAll.filter((m) => municipalityIds.has(m._id)),
  };
}

/** Districts and ULBs visible to the signed-in user (multitenant isolation). */
export async function resolveTenantScope(
  ctx: QueryCtx,
  me: Doc<"users">,
): Promise<{ districts: Doc<"districts">[]; municipalities: Doc<"municipalities">[] }> {
  const districtsAll = (await ctx.db.query("districts").collect()).filter(isActive);
  const municipalitiesAll = (await ctx.db.query("municipalities").collect()).filter(isActive);

  if (me.role === "admin") {
    return { districts: districtsAll, municipalities: municipalitiesAll };
  }

  const fromAllotments = await resolveScopeFromAllotments(ctx, me, districtsAll, municipalitiesAll);
  if (fromAllotments && (fromAllotments.municipalities.length > 0 || fromAllotments.districts.length > 0)) {
    return mergeScopeWithProfile(fromAllotments, me, districtsAll, municipalitiesAll);
  }

  const [districtId, needsTenancy] = await Promise.all([
    effectiveDistrictId(ctx, me),
    roleRequiresTenancy(ctx, me.role),
  ]);

  // Profile-only assignment (no userAllotments rows): single ULB or whole district.
  if (needsTenancy && me.municipalityId) {
    const muni = await ctx.db.get(me.municipalityId);
    if (!muni || !isActive(muni)) {
      return { districts: [], municipalities: [] };
    }
    return {
      districts: districtsAll.filter((d) => d._id === muni.districtId),
      municipalities: [muni],
    };
  }

  if (needsTenancy && districtId) {
    return scopeForDistrict(districtId, districtsAll, municipalitiesAll);
  }

  const fromWards = await scopeFromWardAssignments(ctx, me, districtsAll, municipalitiesAll);
  if (fromWards) return fromWards;

  // Active field users without a profile assignment can use the seeded catalog
  // (common when approved before tenant ids were persisted).
  if (needsTenancy && me.status === "active" && districtsAll.length > 0) {
    return { districts: districtsAll, municipalities: municipalitiesAll };
  }

  return { districts: [], municipalities: [] };
}

/** District ids the caller may access (Agra, Kasganj, …). */
export function tenantDistrictIds(scope: { districts: Doc<"districts">[] }): Set<Id<"districts">> {
  return new Set(scope.districts.map((d) => d._id));
}

/** ULB ids the caller may access within their tenant scope. */
export function tenantMunicipalityIds(scope: { municipalities: Doc<"municipalities">[] }): Set<Id<"municipalities">> {
  return new Set(scope.municipalities.map((m) => m._id));
}

/**
 * Ensures the user may read/write surveys for this ULB.
 * District-scoped supervisors may access any ULB in their district.
 */
export async function assertMunicipalityInScope(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  municipalityId: Id<"municipalities">,
): Promise<Doc<"municipalities">> {
  const muni = await ctx.db.get(municipalityId);
  if (!muni || muni.isActive === false) {
    throw new ConvexError({ code: "BAD_REQUEST", message: "Unknown municipality" });
  }

  if (user.role === "admin") return muni;

  const scope = await resolveTenantScope(ctx, user);
  if (!tenantMunicipalityIds(scope).has(municipalityId)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "This ULB is outside your allotted municipalities.",
    });
  }

  return muni;
}
