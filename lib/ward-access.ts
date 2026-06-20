import type { Doc, Id } from '../convex/_generated/dataModel';

/**
 * Pure ward-access check — municipality scope is enforced separately via tenancy.
 * Supervisors and admins see every ward in their allotted ULBs.
 * Surveyors and QC supervisors with ward assignments are limited to those wards.
 */
export function canReadWard(user: Doc<'users'>, _municipalityId: Id<'municipalities'>, wardNo: string): boolean {
  if (user.role === 'admin' || user.role === 'supervisor') return true;
  if (user.wardAssignments.length === 0) return true;
  const normalized = wardNo.trim();
  return user.wardAssignments.some((w) => w.trim() === normalized);
}
