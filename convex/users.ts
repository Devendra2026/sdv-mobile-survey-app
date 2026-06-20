/**
 * User provisioning — primary path is the Clerk webhook (`convex/http.ts`).
 * `provisionCurrentUser` is the client fallback when webhooks are delayed or
 * missing (common in local dev before the endpoint is configured).
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx, query } from "./_generated/server";
import { userCapabilities } from "./capabilities";
import { clientError, requireIdentity, writeAudit } from "./helpers";

const ALLOWED_REQUESTED_ROLES = new Set(["surveyor", "supervisor"]);
const MAX_REQUESTED_REASON_LEN = 500;

/** Only surveyor/supervisor may be requested at sign-up; ignore spoofed values. */
export function normalizeSignupMetadata(input: { requestedRole?: string; requestedReason?: string }): {
  requestedRole?: string;
  requestedReason?: string;
} {
  const requestedRole =
    input.requestedRole && ALLOWED_REQUESTED_ROLES.has(input.requestedRole) ? input.requestedRole : undefined;
  const trimmed = input.requestedReason?.trim();
  const requestedReason = trimmed && trimmed.length > 0 ? trimmed.slice(0, MAX_REQUESTED_REASON_LEN) : undefined;
  return { requestedRole, requestedReason };
}

/** Current signed-in user's domain row, or null until provisioned. */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const ident = await ctx.auth.getUserIdentity();
    if (!ident) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", ident.subject))
      .unique();

    if (!user) return null;

    let municipality: { code: string; name: string } | null = null;
    let district: { code: string; name: string } | null = null;

    if (user.districtId) {
      const dist = await ctx.db.get(user.districtId);
      if (dist) district = { code: dist.code, name: dist.name };
    }
    if (user.municipalityId) {
      const muni = await ctx.db.get(user.municipalityId);
      if (muni) {
        municipality = { code: muni.code, name: muni.name };
        if (!district) {
          const dist = await ctx.db.get(muni.districtId);
          if (dist) district = { code: dist.code, name: dist.name };
        }
      }
    }

    const [capabilities, roleRow] = await Promise.all([
      userCapabilities(ctx, user),
      ctx.db
        .query("roles")
        .withIndex("by_key", (q) => q.eq("key", user.role))
        .unique(),
    ]);

    return {
      ...user,
      municipality,
      district,
      capabilities,
      roleName: roleRow?.name ?? user.role,
    };
  },
});

interface UpsertUserArgs {
  clerkId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  requestedRole?: string;
  requestedReason?: string;
}

/**
 * Create or update the domain user row. Webhook updates always apply signup
 * metadata; client provisioning only fills `requested*` when still empty.
 */
async function upsertUserRecord(
  ctx: MutationCtx,
  args: UpsertUserArgs,
  opts: { fillSignupMetadataOnlyIfEmpty: boolean },
): Promise<Id<"users">> {
  const meta = normalizeSignupMetadata(args);
  const normalized: UpsertUserArgs = { ...args, ...meta };

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", normalized.clerkId))
    .unique();

  if (existing) {
    const patch: {
      email: string;
      name: string;
      avatarUrl?: string;
      requestedRole?: string;
      requestedReason?: string;
    } = {
      email: normalized.email,
      name: normalized.name,
      avatarUrl: normalized.avatarUrl,
    };

    if (opts.fillSignupMetadataOnlyIfEmpty) {
      if (normalized.requestedRole && !existing.requestedRole) {
        patch.requestedRole = normalized.requestedRole;
      }
      if (normalized.requestedReason && !existing.requestedReason) {
        patch.requestedReason = normalized.requestedReason;
      }
    } else {
      if (normalized.requestedRole !== undefined) patch.requestedRole = normalized.requestedRole;
      if (normalized.requestedReason !== undefined) {
        patch.requestedReason = normalized.requestedReason;
      }
    }

    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  const userId = await ctx.db.insert("users", {
    clerkId: normalized.clerkId,
    email: normalized.email,
    name: normalized.name,
    avatarUrl: normalized.avatarUrl,
    role: "pending",
    status: "pending_approval",
    wardAssignments: [],
    requestedRole: normalized.requestedRole,
    requestedReason: normalized.requestedReason,
  });

  await writeAudit(ctx, {
    action: "user.created",
    entity: "user",
    entityId: userId,
    metadata: { clerkId: normalized.clerkId, email: normalized.email, source: "provision" },
  });

  return userId;
}

/**
 * Idempotent provisioning for the signed-in Clerk user. Called from the
 * setup screen so Convex has a `users` row even when the webhook has not
 * fired yet.
 */
export const provisionCurrentUser = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    requestedRole: v.optional(v.string()),
    requestedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ident = await requireIdentity(ctx);

    const email = (ident.email ?? args.email ?? "").trim();
    if (!email) {
      clientError(
        "PROFILE_INCOMPLETE",
        "An email address is required. Finish sign-up in Clerk or add a primary email.",
      );
    }
    const name = (ident.name ?? args.name ?? email).trim() || email;

    return await upsertUserRecord(
      ctx,
      {
        clerkId: ident.subject,
        email,
        name,
        avatarUrl: ident.pictureUrl ?? args.avatarUrl,
        requestedRole: args.requestedRole,
        requestedReason: args.requestedReason,
      },
      { fillSignupMetadataOnlyIfEmpty: true },
    );
  },
});

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    requestedRole: v.optional(v.string()),
    requestedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await upsertUserRecord(ctx, args, {
      fillSignupMetadataOnlyIfEmpty: false,
    });
  },
});

export const softDeleteFromClerk = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) return;

    await ctx.db.patch(user._id, {
      status: "disabled",
      disabledAt: Date.now(),
    });

    await writeAudit(ctx, {
      action: "user.deleted",
      entity: "user",
      entityId: user._id,
      metadata: { clerkId: args.clerkId },
    });
  },
});
