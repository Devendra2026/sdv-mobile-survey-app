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
import { ConvexError, v } from "convex/values";
import { canReadWard as canReadWardPure } from "../lib/ward-access";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { mergeActorSnapshotIntoMetadata } from "./lib/auditActor";

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
      code: "UNAUTHORIZED",
      message: "Authentication required",
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
): Promise<Doc<"users">> {
  const ident = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", ident.subject))
    .unique();

  if (!user) {
    // Webhook hasn't landed yet OR was missed. The client should retry shortly.
    throw new ConvexError({
      code: "USER_NOT_PROVISIONED",
      message: "Your account is still being set up. Try again in a moment.",
    });
  }
  if (user.status === "disabled") {
    throw new ConvexError({
      code: "ACCOUNT_DISABLED",
      message: "This account has been disabled.",
    });
  }
  if (!opts.allowPending && user.status !== "active") {
    throw new ConvexError({
      code: "AWAITING_APPROVAL",
      message: "Your account is awaiting administrator approval.",
    });
  }
  return user;
}

export type Role = Doc<"users">["role"];

export function requireRole(user: Doc<"users">, ...allowed: Role[]): void {
  if (!allowed.includes(user.role)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You don't have permission for this action.",
    });
  }
}

/**
 * Ward limits apply to surveyors and QC supervisors with explicit ward assignments.
 * Field supervisors see every ward in their allotted ULBs.
 */
export function canReadWard(user: Doc<"users">, municipalityId: Id<"municipalities">, wardNo: string): boolean {
  return canReadWardPure(user, municipalityId, wardNo);
}

/** Tenant + ward check — municipality scope is enforced via assertMunicipalityInScope. */
export function assertCanReadWard(user: Doc<"users">, municipalityId: Id<"municipalities">, wardNo: string): void {
  if (!canReadWard(user, municipalityId, wardNo)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "This ward is not assigned to you.",
    });
  }
}

/** Filter ward rows for dropdowns; QC supervisors with ward assignments see only their wards. */
export function filterWardsForUser<T extends { municipalityId: Id<"municipalities">; wardNo: string }>(
  user: Doc<"users">,
  wards: T[],
): T[] {
  if (user.role === "admin" || user.role === "supervisor") return wards;
  if (user.role === "qc_supervisor" && user.wardAssignments.length > 0) {
    return wards.filter((w) => canReadWard(user, w.municipalityId, w.wardNo));
  }
  if (user.role !== "surveyor") return wards;
  return wards.filter((w) => canReadWard(user, w.municipalityId, w.wardNo));
}

/* ────────────────────────── audit helpers ────────────────────────── */

interface AuditWriteInput {
  actorId?: Id<"users">;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: unknown;
}

export async function writeAudit(ctx: MutationCtx, input: AuditWriteInput): Promise<void> {
  let metadata: unknown = input.metadata;

  if (input.actorId) {
    const actor = await ctx.db.get("users", input.actorId);
    if (actor) {
      metadata = mergeActorSnapshotIntoMetadata(metadata, {
        actorName: actor.name,
        actorEmail: actor.email,
      });
    }
  }

  await ctx.db.insert("auditLogs", {
    actorId: input.actorId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    metadata,
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

/** Map nullable DB rows by `_id` in a single pass (avoids `.filter().map()` chains). */
export function mapTruthyById<T extends { _id: string }>(rows: (T | null | undefined)[]): Map<T["_id"], T> {
  const map = new Map<T["_id"], T>();
  for (const row of rows) {
    if (row) map.set(row._id, row);
  }
  return map;
}
