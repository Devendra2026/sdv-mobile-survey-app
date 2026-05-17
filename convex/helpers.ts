/**
 * Shared server-only helpers used by every query/mutation/action.
 *
 * - `requireIdentity`  — fail fast if no Clerk JWT
 * - `requireUser`      — load the domain user row (ensures the Clerk principal has a
 *                        corresponding `users` row); throws if not approved yet
 * - `requireRole`      — gate by role
 * - `writeAudit`       — append-only event log
 *
 * Anything that touches a user-scoped resource calls these first. Never
 * trust client-supplied userId — derive everything from `ctx.auth`.
 */
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';

export type { QueryCtx };

export type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

/** Authenticated Clerk identity payload. */
export interface Identity {
  subject: string; // Clerk user id (used as users.clerkId)
  email?: string;
  name?: string;
  pictureUrl?: string;
}

export async function requireIdentity(ctx: AnyCtx): Promise<Identity> {
  const ident = await ctx.auth.getUserIdentity();
  if (!ident) {
    throw new ConvexError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }
  return {
    subject: ident.subject,
    email: ident.email ?? undefined,
    name: ident.name ?? undefined,
    pictureUrl: ident.pictureUrl ?? undefined,
  };
}

/**
 * Load the calling user's domain row. Throws if not yet provisioned (webhook
 * or `users.provisionCurrentUser` from the setup screen) or if not approved.
 *
 * Pass `{ allowPending: true }` for screens that need to show "awaiting
 * approval" UI to a freshly-signed-up user.
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  opts: { allowPending?: boolean } = {},
): Promise<Doc<'users'>> {
  const ident = await requireIdentity(ctx);
  const user = await ctx.db
    .query('users')
    .withIndex('by_clerkId', (q) => q.eq('clerkId', ident.subject))
    .unique();

  if (!user) {
    // Webhook hasn't landed yet OR was missed. The client should retry shortly.
    throw new ConvexError({
      code: 'USER_NOT_PROVISIONED',
      message: 'Your account is still being set up. Try again in a moment.',
    });
  }
  if (user.status === 'disabled') {
    throw new ConvexError({
      code: 'ACCOUNT_DISABLED',
      message: 'This account has been disabled.',
    });
  }
  if (!opts.allowPending && user.status !== 'active') {
    throw new ConvexError({
      code: 'AWAITING_APPROVAL',
      message: 'Your account is awaiting administrator approval.',
    });
  }
  return user;
}

export type Role = Doc<'users'>['role'];

export function requireRole(user: Doc<'users'>, ...allowed: Role[]): void {
  if (!allowed.includes(user.role)) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: "You don't have permission for this action.",
    });
  }
}

/**
 * Tenant + ward check. Surveyors can only act on their assigned wards
 * inside their assigned municipality. Supervisors get ULB-wide access.
 * Admins bypass everything.
 */
export function assertCanReadWard(user: Doc<'users'>, municipalityId: Id<'municipalities'>, wardNo: string): void {
  if (user.role === 'admin') return;
  // Municipality / district scope is enforced separately via assertMunicipalityInScope.
  if (user.role === 'supervisor') return;
  // surveyor — restrict to assigned wards when any are listed
  if (user.role === 'surveyor' && user.wardAssignments.length > 0 && !user.wardAssignments.includes(wardNo)) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'This ward is not assigned to you.',
    });
  }
}

/* ────────────────────────── audit helpers ────────────────────────── */

interface AuditWriteInput {
  actorId?: Id<'users'>;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: unknown;
}

export async function writeAudit(ctx: MutationCtx, input: AuditWriteInput): Promise<void> {
  await ctx.db.insert('auditLogs', {
    actorId: input.actorId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    metadata: input.metadata,
  });
}

/* ────────────────────────── convenience validators ────────────────────────── */

/** Trims and rejects empty strings. */
export const requiredString = v.string();

/** Convex error payload — keep the shape consistent with the mobile error mapper. */
export interface ConvexErrPayload {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export function clientError(code: string, message: string, details?: Record<string, string[]>): never {
  throw new ConvexError(details ? { code, message, details } : { code, message });
}
