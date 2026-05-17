/**
 * Shared tenant-scope resolution for queries and mutations.
 */
import { ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

function isActive<T extends { isActive?: boolean }>(row: T): boolean {
  return row.isActive !== false;
}

function isFieldRole(role: Doc<'users'>['role']): role is 'surveyor' | 'supervisor' {
  return role === 'surveyor' || role === 'supervisor';
}

/** Resolve ULBs/districts from ward numbers when profile tenant ids are missing. */
async function scopeFromWardAssignments(
  ctx: QueryCtx,
  me: Doc<'users'>,
  districtsAll: Doc<'districts'>[],
  municipalitiesAll: Doc<'municipalities'>[],
): Promise<{ districts: Doc<'districts'>[]; municipalities: Doc<'municipalities'>[] } | null> {
  if (me.wardAssignments.length === 0) return null;

  const wards = await ctx.db.query('wards').collect();
  const matched = wards.filter((w) => me.wardAssignments.includes(w.wardNo));
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
  user: Doc<'users'>,
): Promise<Id<'districts'> | undefined> {
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
  districtId: Id<'districts'>,
  districtsAll: Doc<'districts'>[],
  municipalitiesAll: Doc<'municipalities'>[],
): { districts: Doc<'districts'>[]; municipalities: Doc<'municipalities'>[] } {
  return {
    districts: districtsAll.filter((d) => d._id === districtId),
    municipalities: municipalitiesAll.filter((m) => m.districtId === districtId),
  };
}

/** Districts and ULBs visible to the signed-in user (multitenant isolation). */
export async function resolveTenantScope(
  ctx: QueryCtx,
  me: Doc<'users'>,
): Promise<{ districts: Doc<'districts'>[]; municipalities: Doc<'municipalities'>[] }> {
  const districtsAll = (await ctx.db.query('districts').collect()).filter(isActive);
  const municipalitiesAll = (await ctx.db.query('municipalities').collect()).filter(isActive);

  if (me.role === 'admin') {
    return { districts: districtsAll, municipalities: municipalitiesAll };
  }

  const districtId = await effectiveDistrictId(ctx, me);

  // Field users assigned to one ULB see that district + ULB only.
  if (me.role === 'supervisor' && me.municipalityId) {
    const muni = await ctx.db.get(me.municipalityId);
    if (!muni || !isActive(muni)) {
      return { districts: [], municipalities: [] };
    }
    return {
      districts: districtsAll.filter((d) => d._id === muni.districtId),
      municipalities: [muni],
    };
  }

  if (me.role === 'supervisor' && districtId) {
    return scopeForDistrict(districtId, districtsAll, municipalitiesAll);
  }

  if (me.role === 'surveyor' && me.municipalityId) {
    const muni = await ctx.db.get(me.municipalityId);
    if (!muni || !isActive(muni)) {
      return { districts: [], municipalities: [] };
    }
    return {
      districts: districtsAll.filter((d) => d._id === muni.districtId),
      municipalities: [muni],
    };
  }

  // District-scoped field users (no single ULB on file).
  if (districtId) {
    return scopeForDistrict(districtId, districtsAll, municipalitiesAll);
  }

  const fromWards = await scopeFromWardAssignments(ctx, me, districtsAll, municipalitiesAll);
  if (fromWards) return fromWards;

  // Active field users without a profile assignment can use the seeded catalog
  // (common when approved before tenant ids were persisted).
  if (isFieldRole(me.role) && me.status === 'active' && districtsAll.length > 0) {
    return { districts: districtsAll, municipalities: municipalitiesAll };
  }

  return { districts: [], municipalities: [] };
}

/** District ids the caller may access (Agra, Kasganj, …). */
export function tenantDistrictIds(scope: { districts: Doc<'districts'>[] }): Set<Id<'districts'>> {
  return new Set(scope.districts.map((d) => d._id));
}

/** ULB ids the caller may access within their tenant scope. */
export function tenantMunicipalityIds(scope: { municipalities: Doc<'municipalities'>[] }): Set<Id<'municipalities'>> {
  return new Set(scope.municipalities.map((m) => m._id));
}

/**
 * Ensures the user may read/write surveys for this ULB.
 * District-scoped supervisors may access any ULB in their district.
 */
export async function assertMunicipalityInScope(
  ctx: QueryCtx | MutationCtx,
  user: Doc<'users'>,
  municipalityId: Id<'municipalities'>,
): Promise<Doc<'municipalities'>> {
  if (user.role === 'admin') {
    const muni = await ctx.db.get(municipalityId);
    if (!muni) {
      throw new ConvexError({ code: 'BAD_REQUEST', message: 'Unknown municipality' });
    }
    return muni;
  }

  const muni = await ctx.db.get(municipalityId);
  if (!muni || muni.isActive === false) {
    throw new ConvexError({ code: 'BAD_REQUEST', message: 'Unknown municipality' });
  }

  const districtId = await effectiveDistrictId(ctx, user);

  if (user.role === 'supervisor' && user.municipalityId) {
    const assigned = await ctx.db.get(user.municipalityId);
    if (assigned && isActive(assigned)) {
      if (user.municipalityId !== municipalityId) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'This ULB is outside your assigned municipality.',
        });
      }
      return muni;
    }
  }

  if (user.role === 'supervisor' && districtId) {
    if (muni.districtId !== districtId) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'This ULB is outside your assigned district.',
      });
    }
    return muni;
  }

  if (user.role === 'surveyor' && user.municipalityId) {
    const assigned = await ctx.db.get(user.municipalityId);
    if (assigned && isActive(assigned)) {
      if (user.municipalityId !== municipalityId) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'This ULB is outside your assigned municipality.',
        });
      }
      return muni;
    }
  }

  if (districtId) {
    if (muni.districtId !== districtId) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'This ULB is outside your assigned district.',
      });
    }
    return muni;
  }

  if (isFieldRole(user.role)) {
    return muni;
  }

  throw new ConvexError({
    code: 'FORBIDDEN',
    message: 'No tenant scope assigned to your account.',
  });
}
